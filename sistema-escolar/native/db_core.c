#include <sqlite3.h>
#include <stdio.h>
#include <stdlib.h>
int main(int argc,char **argv) {
 if(argc!=3){fprintf(stderr,"usage: db_init database schema.sql\n");return 2;}
 FILE *f=fopen(argv[2],"rb");if(!f)return 2;
 if(fseek(f,0,SEEK_END)){fclose(f);return 2;}long n=ftell(f);rewind(f);
 if(n<0||n>1024*1024){fclose(f);return 2;}char *sql=calloc((size_t)n+1,1);
 if(!sql){fclose(f);return 2;}if(fread(sql,1,(size_t)n,f)!=(size_t)n){free(sql);fclose(f);return 2;}fclose(f);
 sqlite3 *db=NULL;int rc=sqlite3_open(argv[1],&db);char *error=NULL;
 if(rc==SQLITE_OK)rc=sqlite3_exec(db,sql,NULL,NULL,&error);
 if(rc!=SQLITE_OK)fprintf(stderr,"%s\n",error?error:sqlite3_errmsg(db));
 sqlite3_free(error);free(sql);sqlite3_close(db);return rc==SQLITE_OK?0:1;
}
