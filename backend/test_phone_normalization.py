"""
Test Suite for Phone Normalization and MSG91 Country Code Validation
Tests:
- Standard 10-digit Indian numbers (starts with 6, 7, 8, 9)
- International formatted numbers (+91, 91)
- Numbers with spaces, hyphens, and parentheses
- Numbers with leading single or multiple zeros (0, 00)
- Duplicate prefix prevention (+91+91..., 9191...)
- Rejection of invalid lengths, characters, and non-Indian mobile prefixes
"""

import sys
import unittest
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sms import normalize_indian_phone


class TestPhoneNormalization(unittest.TestCase):
    def test_standard_domestic_10_digits(self):
        valid, dom, intl, err = normalize_indian_phone("9554384886")
        self.assertTrue(valid)
        self.assertEqual(dom, "9554384886")
        self.assertEqual(intl, "919554384886")
        self.assertEqual(err, "")

    def test_international_plus_91(self):
        valid, dom, intl, err = normalize_indian_phone("+919554384886")
        self.assertTrue(valid)
        self.assertEqual(dom, "9554384886")
        self.assertEqual(intl, "919554384886")

    def test_spaces_and_hyphens(self):
        valid, dom, intl, err = normalize_indian_phone("+91 95543 84886")
        self.assertTrue(valid)
        self.assertEqual(dom, "9554384886")
        self.assertEqual(intl, "919554384886")

        valid2, dom2, intl2, err2 = normalize_indian_phone("  +91-95543-84886  ")
        self.assertTrue(valid2)
        self.assertEqual(dom2, "9554384886")

    def test_duplicate_country_prefixes(self):
        # +91+91...
        valid1, dom1, intl1, err1 = normalize_indian_phone("+91+919554384886")
        self.assertTrue(valid1)
        self.assertEqual(dom1, "9554384886")
        self.assertEqual(intl1, "919554384886")

        # 9191...
        valid2, dom2, intl2, err2 = normalize_indian_phone("91919554384886")
        self.assertTrue(valid2)
        self.assertEqual(dom2, "9554384886")
        self.assertEqual(intl2, "919554384886")

        # +91 91...
        valid3, dom3, intl3, err3 = normalize_indian_phone("+91 91 95543 84886")
        self.assertTrue(valid3)
        self.assertEqual(dom3, "9554384886")

    def test_leading_zeros(self):
        # Single 0
        valid1, dom1, intl1, err1 = normalize_indian_phone("09554384886")
        self.assertTrue(valid1)
        self.assertEqual(dom1, "9554384886")

        # Double 00 international
        valid2, dom2, intl2, err2 = normalize_indian_phone("00919554384886")
        self.assertTrue(valid2)
        self.assertEqual(dom2, "9554384886")

        # +91 with leading zero inside
        valid3, dom3, intl3, err3 = normalize_indian_phone("+91 09554384886")
        self.assertTrue(valid3)
        self.assertEqual(dom3, "9554384886")

    def test_domestic_number_starting_with_91(self):
        # Indian mobile number whose first two digits happen to be 91
        valid, dom, intl, err = normalize_indian_phone("9123456780")
        self.assertTrue(valid)
        self.assertEqual(dom, "9123456780")
        self.assertEqual(intl, "919123456780")

        # Same number with +91 international prefix
        valid2, dom2, intl2, err2 = normalize_indian_phone("+919123456780")
        self.assertTrue(valid2)
        self.assertEqual(dom2, "9123456780")
        self.assertEqual(intl2, "919123456780")

    def test_invalid_cases(self):
        # Short length
        valid1, _, _, err1 = normalize_indian_phone("12345")
        self.assertFalse(valid1)
        self.assertIn("Invalid phone length", err1)

        # Starts with invalid mobile digit (e.g. 5)
        valid2, _, _, err2 = normalize_indian_phone("5554384886")
        self.assertFalse(valid2)
        self.assertIn("Must start with digits 6, 7, 8, or 9", err2)

        # Empty / blank
        valid3, _, _, err3 = normalize_indian_phone("   ")
        self.assertFalse(valid3)
        self.assertIn("cannot be blank", err3)


if __name__ == "__main__":
    unittest.main(verbosity=2)

