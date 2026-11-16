import sys

nums = sorted(float(x) for x in sys.stdin.read().split())
n = len(nums)
m = nums[n // 2] if n % 2 else (nums[n // 2 - 1] + nums[n // 2]) / 2
print(int(m) if m == int(m) else m)
