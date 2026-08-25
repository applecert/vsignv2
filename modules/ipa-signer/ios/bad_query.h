#ifndef bad_query_h
#define bad_query_h

#include <stdio.h>
#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

int64_t bad_query(const char* path, bool create, const char *group_identifier, bool is_group);
char *bad_query_list(const char *path, int64_t max_inode);
void bad_query_release(int64_t handle);

#ifdef __cplusplus
}
#endif

#endif
