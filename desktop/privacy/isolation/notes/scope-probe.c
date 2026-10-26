// SPDX-License-Identifier: EUPL-1.2
// Qualification probe only. The macOS sandbox API below is private; callers
// must fail closed when its semantics cannot be verified on the current host.
#include <stdio.h>
#include <stdlib.h>
#include <errno.h>
#include <unistd.h>
#include <sys/types.h>
extern int sandbox_check(pid_t pid, const char *operation, int type, ...);
extern const int SANDBOX_CHECK_NO_REPORT;
int main(int argc, char **argv) {
  if (argc != 4) return 64;
  pid_t pid = (pid_t)strtol(argv[1], NULL, 10);
  if (pid < 2) return 64;
  int own = sandbox_check(pid, "file-read-data", 1 | SANDBOX_CHECK_NO_REPORT, argv[2]);
  int other = sandbox_check(pid, "file-read-data", 1 | SANDBOX_CHECK_NO_REPORT, argv[3]);
  printf("{\"own\":%d,\"other\":%d,\"flag\":%d,\"errno\":%d,\"basic\":%d}\n", own, other, SANDBOX_CHECK_NO_REPORT, errno,sandbox_check(pid, NULL, 0));
  return 0;
}
