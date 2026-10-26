// SPDX-License-Identifier: EUPL-1.2
// A host-only stop barrier for inherited macOS Seatbelt scopes. It does not
// inspect process arguments, environments, or user files. The two probe files
// are immutable to every process in the scope. A detached/reparented descendant
// inherits the same read decision even after escaping a POSIX process group.
#include <errno.h>
#include <libproc.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/proc_info.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>
extern int sandbox_check(pid_t pid, const char *operation, int type, ...);
extern const int SANDBOX_CHECK_NO_REPORT;
#define MAX_PIDS 131072
#define ZOMBIE 5
static int read_decision(pid_t pid, const char *file) {
  return sandbox_check(pid, "file-read-data", 1 | SANDBOX_CHECK_NO_REPORT, file);
}
static int live_info(pid_t pid, struct proc_bsdinfo *out) {
  memset(out, 0, sizeof(*out));
  int result = proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, out, sizeof(*out));
  if (result != sizeof(*out)) return 0;
  return out->pbi_uid == getuid() && out->pbi_status != ZOMBIE;
}
static int same_scope(pid_t pid, const char *own, const char *control, struct proc_bsdinfo *info) {
  if (pid < 2 || pid == getpid() || !live_info(pid, info)) return 0;
  if (sandbox_check(pid, NULL, 0) != 1) return 0;
  return read_decision(pid, own) == 0 && read_decision(pid, control) == 1;
}
static int valid_probe(const char *file) {
  struct stat st;
  return file[0] == '/' && lstat(file, &st) == 0 && S_ISREG(st.st_mode) &&
    st.st_uid == getuid() && st.st_nlink == 1 && (st.st_mode & 0222) == 0;
}
static int snapshot(pid_t *pids) {
  int count = proc_listallpids(pids, MAX_PIDS * sizeof(pid_t));
  if (count <= 0 || count >= MAX_PIDS) return -1;
  return count;
}
static int unchanged(pid_t pid, const struct proc_bsdinfo *before) {
  struct proc_bsdinfo after;
  return live_info(pid, &after) && before->pbi_start_tvsec == after.pbi_start_tvsec && before->pbi_start_tvusec == after.pbi_start_tvusec;
}
int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--self-test") == 0) {
    // A non-sandboxed owner is required. Private API availability alone is not
    // sufficient: each launch additionally attests the child's own decisions.
    if (sandbox_check(getpid(), NULL, 0) != 0) return 69;
    puts("{\"available\":true,\"implementation\":\"macos-seatbelt-scope-v1\"}"); return 0;
  }
  if (argc != 4 || !valid_probe(argv[2]) || !valid_probe(argv[3]) || strcmp(argv[2], argv[3]) == 0) return 64;
  const char *mode = argv[1], *own = argv[2], *control = argv[3];
  if (read_decision(getpid(), own) != 0 || read_decision(getpid(), control) != 0) return 69;
  pid_t *pids = calloc(MAX_PIDS, sizeof(pid_t)); if (!pids) return 71;
  if (strcmp(mode, "--count") == 0) {
    int count = snapshot(pids), matches = 0; if (count < 0) { free(pids); return 70; }
    for (int i = 0; i < count; i++) { struct proc_bsdinfo info; if (same_scope(pids[i], own, control, &info)) matches++; }
    printf("{\"matchingProcesses\":%d}\n", matches); free(pids); return 0;
  }
  if (strcmp(mode, "--stop") != 0) { free(pids); return 64; }
  int quiet = 0, terminated = 0;
  // Freeze discovered members before killing them. Re-scan to include forks
  // created just before the freeze; no live ancestor is allowed to remain.
  for (int pass = 0; pass < 500; pass++) {
    int count = snapshot(pids), matches = 0; if (count < 0) { free(pids); return 70; }
    for (int i = 0; i < count; i++) {
      struct proc_bsdinfo before;
      if (!same_scope(pids[i], own, control, &before)) continue;
      matches++;
      if (!unchanged(pids[i], &before)) continue;
      if (kill(pids[i], SIGSTOP) != 0 && errno != ESRCH) { free(pids); return 77; }
    }
    count = snapshot(pids); if (count < 0) { free(pids); return 70; }
    for (int i = 0; i < count; i++) {
      struct proc_bsdinfo before;
      if (!same_scope(pids[i], own, control, &before) || !unchanged(pids[i], &before)) continue;
      if (kill(pids[i], SIGKILL) != 0 && errno != ESRCH) { free(pids); return 77; }
      terminated++;
    }
    if (matches == 0) quiet++; else quiet = 0;
    if (quiet >= 3) { printf("{\"writersStopped\":true,\"matchingProcesses\":0,\"terminated\":%d,\"processTreeBoundary\":\"inherited-seatbelt-scope\"}\n", terminated); free(pids); return 0; }
    usleep(10000);
  }
  free(pids); return 75;
}
