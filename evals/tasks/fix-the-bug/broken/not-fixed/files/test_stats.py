import unittest

from stats import average


class AverageTests(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(average([]), 0.0)

    def test_normal(self):
        self.assertEqual(average([1, 2, 3]), 2.0)


if __name__ == "__main__":
    unittest.main()
