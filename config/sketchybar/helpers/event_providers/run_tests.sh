#!/bin/bash
set -e
gcc -std=c99 -o test_format_message test_format_message.c
./test_format_message
rm test_format_message
