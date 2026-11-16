import sys

nums = sorted(float(x) for x in sys.stdin.read().split())
m = nums[len(nums) // 2]
print(int(m) if m == int(m) else m)
