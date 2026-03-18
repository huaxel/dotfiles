import unittest
from unittest.mock import MagicMock, patch
import sys
import os

# Add the directory to sys.path so we can import pythonrc
sys.path.append(os.path.dirname(__file__))

class TestREPLHooks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Save original hooks and ps1 to restore later
        cls.orig_excepthook = sys.excepthook
        cls.orig_displayhook = sys.displayhook
        cls.orig_ps1 = getattr(sys, 'ps1', None)

        # Mock print to avoid cluttering test output during import
        with patch('builtins.print'):
            import pythonrc
            cls.pythonrc = pythonrc

    @classmethod
    def tearDownClass(cls):
        # Restore original hooks
        sys.excepthook = cls.orig_excepthook
        sys.displayhook = cls.orig_displayhook
        if cls.orig_ps1 is not None:
            sys.ps1 = cls.orig_ps1
        elif hasattr(sys, 'ps1'):
            del sys.ps1

    def test_my_displayhook_resets_failure_flag_on_none(self):
        hooks = self.pythonrc.REPLHooks()
        hooks.failure_flag = True

        # Mock the original displayhook that it would call
        mock_original = MagicMock()
        hooks.original_displayhook = mock_original

        hooks.my_displayhook(None)

        self.assertFalse(hooks.failure_flag)
        mock_original.assert_called_once_with(None)

    def test_my_displayhook_preserves_failure_flag_on_value(self):
        hooks = self.pythonrc.REPLHooks()
        hooks.failure_flag = True

        mock_original = MagicMock()
        hooks.original_displayhook = mock_original

        hooks.my_displayhook("hello")

        self.assertTrue(hooks.failure_flag)
        mock_original.assert_called_once_with("hello")

    def test_my_excepthook_sets_failure_flag_and_global_exit(self):
        hooks = self.pythonrc.REPLHooks()
        hooks.failure_flag = False

        mock_original = MagicMock()
        hooks.original_excepthook = mock_original

        type_ = RuntimeError
        value = RuntimeError("oops")
        traceback = None

        hooks.my_excepthook(type_, value, traceback)

        self.assertTrue(hooks.failure_flag)
        self.assertEqual(hooks.global_exit, value)
        mock_original.assert_called_once_with(type_, value, traceback)

if __name__ == '__main__':
    unittest.main()
