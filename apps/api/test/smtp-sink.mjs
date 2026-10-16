// A tiny SMTP server for tests: accepts every message and keeps it in memory (no TLS, no auth).
import { createServer } from "node:net";

/** Decodes quoted-printable (UTF-8), as nodemailer writes it. */
function decodeQp(s) {
  const soft = s.replace(/=\r?\n/g, "");
  const bytes = [];
  for (let i = 0; i < soft.length; i++) {
    const hex = soft.slice(i + 1, i + 3);
    if (soft[i] === "=" && /^[0-9A-F]{2}$/i.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else bytes.push(...Buffer.from(soft[i], "utf8"));
  }
  return Buffer.from(bytes).toString("utf8");
}

/** A header's encoded words (=?UTF-8?B?…?=), as text. */
const decodeWords = (h) =>
  h.replace(/=\?utf-8\?([bq])\?([^?]*)\?=\s*/gi, (_, enc, data) => (enc.toLowerCase() === "b" ? Buffer.from(data, "base64").toString("utf8") : decodeQp(data.replace(/_/g, " "))));

/** Every part's body, decoded (quoted-printable or base64), so tests can read the text and links. */
function bodies(raw) {
  return raw
    .split(/\r\n--[^\r\n]+\r\n/)
    .map((part) => {
      const [head, ...rest] = part.split("\r\n\r\n");
      const body = rest.join("\r\n\r\n");
      if (/content-transfer-encoding:\s*base64/i.test(head)) return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
      if (/content-transfer-encoding:\s*quoted-printable/i.test(head)) return decodeQp(body);
      return part;
    })
    .join("\n");
}

export async function startSmtpSink() {
  const messages = [];
  const server = createServer((sock) => {
    let buf = "";
    let inData = false;
    let msg = { from: "", to: [], raw: "" };
    sock.write("220 sink ESMTP\r\n");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = buf.indexOf("\r\n.\r\n");
          if (end < 0) return;
          msg.raw = buf.slice(0, end);
          buf = buf.slice(end + 5);
          inData = false;
          const head = msg.raw.split("\r\n\r\n")[0].replace(/\r\n[ \t]+/g, " ");
          const subject = decodeWords(/^Subject: (.*)$/m.exec(head)?.[1] ?? "");
          const text = bodies(msg.raw);
          messages.push({ from: msg.from, to: msg.to, subject, text, links: [...text.matchAll(/https?:\/\/[^\s"<>]+/g)].map((m) => m[0].replace(/&amp;/g, "&")) });
          msg = { from: "", to: [], raw: "" };
          sock.write("250 OK queued\r\n");
          continue;
        }
        const nl = buf.indexOf("\r\n");
        if (nl < 0) return;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO" || cmd === "HELO") sock.write("250-sink\r\n250 8BITMIME\r\n");
        else if (cmd === "MAIL") (msg.from = /<(.*)>/.exec(line)?.[1] ?? ""), sock.write("250 OK\r\n");
        else if (cmd === "RCPT") msg.to.push(/<(.*)>/.exec(line)?.[1] ?? ""), sock.write("250 OK\r\n");
        else if (cmd === "DATA") (inData = true), sock.write("354 End with <CRLF>.<CRLF>\r\n");
        else if (cmd === "QUIT") sock.end("221 Bye\r\n");
        else sock.write("250 OK\r\n");
      }
    });
    sock.on("error", () => {});
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  return {
    port,
    messages,
    /** Waits for a message to an address (optionally matching the subject). */
    async next(to, subject = "", timeoutMs = 5000) {
      const t0 = Date.now();
      for (;;) {
        const i = messages.findIndex((m) => m.to.includes(to) && m.subject.includes(subject));
        if (i >= 0) return messages.splice(i, 1)[0];
        if (Date.now() - t0 > timeoutMs) throw new Error(`no email to ${to} (${subject})`);
        await new Promise((r) => setTimeout(r, 50));
      }
    },
    close: () => new Promise((r) => server.close(r)),
  };
}
