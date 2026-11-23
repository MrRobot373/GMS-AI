/**
 * Recording conversations for compliance (Admin → Settings → Data & privacy). When an admin turns it on, everyone sees a
 * notice in chat, and every question and answer is copied to `conversation_log` as it happens. The copy has no links to
 * the chat, so it stays when a chat is deleted (by its owner or by the retention setting), and is removed after the
 * organization's recording period. Admins download it as CSV. Erasing a person removes their recorded messages too.
 */
import { conversationLog, eq, workspace, type DB } from "@aatmiq/db";

export async function recordConversation(
  db: DB,
  e: { workspaceId: string; chatId: string; chatTitle: string; user: { id: string; email: string; name: string }; role: "user" | "assistant"; content: string; model: string | null },
) {
  const [ws] = await db.select({ name: workspace.name }).from(workspace).where(eq(workspace.id, e.workspaceId));
  await db.insert(conversationLog).values({
    workspaceId: e.workspaceId,
    workspaceName: ws?.name ?? null,
    chatId: e.chatId,
    chatTitle: e.chatTitle,
    userId: e.user.id,
    userEmail: e.user.email,
    userName: e.user.name,
    role: e.role,
    content: e.content,
    model: e.model,
  });
}
