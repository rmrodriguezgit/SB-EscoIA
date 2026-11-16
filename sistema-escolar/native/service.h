#ifndef SERVICE_H
#define SERVICE_H
#include <sqlite3.h>
#include "vendor/cJSON.h"
#include <stddef.h>
extern sqlite3 *db;
extern char failure[512];
const char *str(cJSON *,const char *);
double num(cJSON *,const char *);
cJSON *rows(const char *,cJSON *);
int command(const char *,cJSON *);
cJSON *array(void);
void push(cJSON *,cJSON *);
cJSON *ok_id(void);
cJSON *ingest_archive(cJSON *);
cJSON *parse_xlsx(cJSON *);
cJSON *native_schedule(cJSON *);
cJSON *native_search(cJSON *);
cJSON *native_metrics(cJSON *);
cJSON *generate_files(cJSON *);
#endif
