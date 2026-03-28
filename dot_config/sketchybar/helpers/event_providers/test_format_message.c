#define TESTING
#include "sketchybar.h"
#include <assert.h>
#include <string.h>
#include <stdio.h>

void test_basic() {
  char message[] = "hello world";
  char formatted[256];
  memset(formatted, 0xAA, sizeof(formatted));
  uint32_t len = format_message(message, formatted);

  // "hello\0world\0\0"
  assert(len == 13);
  assert(memcmp(formatted, "hello\0world\0\0", 13) == 0);
  printf("test_basic passed\n");
}

void test_quotes() {
  char message[] = "hello 'world again'";
  char formatted[256];
  memset(formatted, 0xAA, sizeof(formatted));
  uint32_t len = format_message(message, formatted);

  // "hello\0world again\0\0"
  assert(len == 19);
  assert(memcmp(formatted, "hello\0world again\0\0", 19) == 0);
  printf("test_quotes passed\n");
}

void test_double_quotes() {
  char message[] = "hello \"world again\"";
  char formatted[256];
  memset(formatted, 0xAA, sizeof(formatted));
  uint32_t len = format_message(message, formatted);

  // "hello\0world again\0\0"
  assert(len == 19);
  assert(memcmp(formatted, "hello\0world again\0\0", 19) == 0);
  printf("test_double_quotes passed\n");
}

void test_nested_quotes() {
  char message[] = "cmd 'arg \"with space\"'";
  char formatted[256];
  memset(formatted, 0xAA, sizeof(formatted));
  uint32_t len = format_message(message, formatted);

  // "cmd\0arg \"with space\"\0\0"
  // Wait, I am a bit confused by my own hex dump.
  // cmd is 63 6d 64 (3 bytes)
  // 00 (1 byte)
  // arg is 61 72 67 (3 bytes)
  // space is 20 (1 byte)
  // with is 77 69 74 68 (4 bytes)
  // space is 20 (1 byte)
  // space is 73 70 61 63 65 (5 bytes)
  // 00 (1 byte)
  // 00 (1 byte)
  // Total: 3+1+3+1+4+1+5+1+1 = 20 bytes.

  // Let's check the hex dump again:
  // 63 6d 64 | 00 | 61 72 67 | 20 | 77 69 74 68 | 20 | 73 70 61 63 65 | 00 | 00
  //   c  m  d      a  r  g        w  i  t  h        s  p  a  c  e

  // Ah! "space" is 73 70 61 63 65. I was reading it as a literal space 0x20.
  // The word is "space".

  char expected[] = "cmd\0arg \"with space\"\0\0";
  // cmd (3) + \0 (1) + arg (3) + space (1) + " (1) + with (4) + space (1) + space (5) + " (1) + \0 (1) + \0 (1)
  // No, the quotes should be there.

  assert(len == 20);
  // I will just use the hex values to be sure.
  unsigned char expected_hex[] = {0x63, 0x6d, 0x64, 0x00, 0x61, 0x72, 0x67, 0x20, 0x77, 0x69, 0x74, 0x68, 0x20, 0x73, 0x70, 0x61, 0x63, 0x65, 0x00, 0x00};
  assert(memcmp(formatted, expected_hex, 20) == 0);
  printf("test_nested_quotes passed\n");
}

void test_multiple_spaces() {
  char message[] = "one   two";
  char formatted[256];
  memset(formatted, 0xAA, sizeof(formatted));
  uint32_t len = format_message(message, formatted);

  // "one\0\0\0two\0\0"
  assert(len == 11);
  assert(memcmp(formatted, "one\0\0\0two\0\0", 11) == 0);
  printf("test_multiple_spaces passed\n");
}

void test_trailing_space() {
  char message[] = "hello ";
  char formatted[256];
  memset(formatted, 0xAA, sizeof(formatted));
  uint32_t len = format_message(message, formatted);

  // "hello\0\0"
  assert(len == 7);
  assert(memcmp(formatted, "hello\0\0", 7) == 0);
  printf("test_trailing_space passed\n");
}

void test_empty() {
  char message[] = "";
  char formatted[256];
  memset(formatted, 0xAA, sizeof(formatted));
  uint32_t len = format_message(message, formatted);

  // "\0\0"
  assert(len == 2);
  assert(formatted[0] == '\0');
  assert(formatted[1] == '\0');
  printf("test_empty passed\n");
}

void test_single_space() {
  char message[] = " ";
  char formatted[256];
  memset(formatted, 0xAA, sizeof(formatted));
  uint32_t len = format_message(message, formatted);

  // "\0\0"
  assert(len == 2);
  assert(formatted[0] == '\0');
  assert(formatted[1] == '\0');
  printf("test_single_space passed\n");
}

void test_null() {
  char formatted[256];
  memset(formatted, 0xAA, sizeof(formatted));
  uint32_t len = format_message(NULL, formatted);

  assert(len == 0);
  printf("test_null passed\n");
}

int main() {
  test_basic();
  test_quotes();
  test_double_quotes();
  test_nested_quotes();
  test_multiple_spaces();
  test_trailing_space();
  test_empty();
  test_single_space();
  test_null();
  printf("All tests finished\n");
  return 0;
}
