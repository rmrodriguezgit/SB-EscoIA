#define _DARWIN_C_SOURCE
#define _POSIX_C_SOURCE 200809L
#include "service.h"
#include "vendor/sqlite-vec.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <math.h>
#include <mach/mach.h>
#include <sys/sysctl.h>
sqlite3 *db;
char failure[512];
const char *str(cJSON *o,const char *k){const cJSON *v=cJSON_GetObjectItemCaseSensitive(o,k);return cJSON_IsString(v)?v->valuestring:"";}
double num(cJSON *o,const char *k){const cJSON *v=cJSON_GetObjectItemCaseSensitive(o,k);return cJSON_IsNumber(v)?v->valuedouble:0;}
cJSON *array(void){return cJSON_CreateArray();}void push(cJSON *a,cJSON *v){cJSON_AddItemToArray(a,v);}
static sqlite3_stmt *prepare(const char *sql,cJSON *params){
 sqlite3_stmt *s=NULL;if(sqlite3_prepare_v2(db,sql,-1,&s,NULL)!=SQLITE_OK)goto bad;
 if(cJSON_GetArraySize(params)!=sqlite3_bind_parameter_count(s)){snprintf(failure,sizeof failure,"Numero de parametros incorrecto");sqlite3_finalize(s);return NULL;}
 int i=1;cJSON *p; cJSON_ArrayForEach(p,params){int rc=SQLITE_OK;if(cJSON_IsString(p))rc=sqlite3_bind_text(s,i,p->valuestring,-1,SQLITE_TRANSIENT);else if(cJSON_IsNumber(p)&&isfinite(p->valuedouble))rc=sqlite3_bind_double(s,i,p->valuedouble);else if(cJSON_IsBool(p))rc=sqlite3_bind_int(s,i,cJSON_IsTrue(p));else if(cJSON_IsNull(p))rc=sqlite3_bind_null(s,i);else rc=SQLITE_MISMATCH;if(rc!=SQLITE_OK)goto bad;i++;}return s;
 bad:snprintf(failure,sizeof failure,"%s",sqlite3_errmsg(db));sqlite3_finalize(s);return NULL;
}
cJSON *rows(const char *sql,cJSON *params){sqlite3_stmt *s=prepare(sql,params);if(!s)return NULL;cJSON *out=array();int rc;while((rc=sqlite3_step(s))==SQLITE_ROW){cJSON *row=cJSON_CreateObject();for(int j=0;j<sqlite3_column_count(s);j++){const char *k=sqlite3_column_name(s,j);int t=sqlite3_column_type(s,j);if(t==SQLITE_INTEGER||t==SQLITE_FLOAT)cJSON_AddNumberToObject(row,k,sqlite3_column_double(s,j));else if(t==SQLITE_NULL)cJSON_AddNullToObject(row,k);else cJSON_AddStringToObject(row,k,(const char*)sqlite3_column_text(s,j));}push(out,row);if(cJSON_GetArraySize(out)>10000){rc=SQLITE_TOOBIG;break;}}
 if(rc!=SQLITE_DONE){snprintf(failure,sizeof failure,"%s",sqlite3_errmsg(db));cJSON_Delete(out);out=NULL;}sqlite3_finalize(s);return out;}
int command(const char *sql,cJSON *params){sqlite3_stmt *s=prepare(sql,params);if(!s)return 0;int rc=sqlite3_step(s);if(rc!=SQLITE_DONE)snprintf(failure,sizeof failure,"%s",sqlite3_errmsg(db));sqlite3_finalize(s);return rc==SQLITE_DONE;}
cJSON *ok_id(void){cJSON *o=cJSON_CreateObject();cJSON_AddNumberToObject(o,"id",(double)sqlite3_last_insert_rowid(db));cJSON_AddNumberToObject(o,"changed",sqlite3_changes(db));return o;}
/* SQL is a compile-time allowlist. No caller-supplied SQL crosses this boundary. */
typedef struct {const char *name,*sql;int write;} operation;
static const operation operations[]={
 { "artifact_create","INSERT INTO artifacts VALUES(?,?,?)",1},
 { "artifact","SELECT actor_id FROM artifacts WHERE id=?",0},
 {"version","PRAGMA user_version",0},
 {"login","SELECT id,role,password_hash FROM users WHERE external_id=?",0},
 {"user","INSERT INTO users(role,external_id,password_hash) VALUES(?,?,?)",1},
 {"users","SELECT id,role,external_id FROM users ORDER BY id",0},
 {"students","SELECT id,number,name FROM students ORDER BY name",0},
 {"teachers","SELECT id,name,background,industry_years FROM teachers ORDER BY name",0},
 {"programs","SELECT * FROM programs ORDER BY name",0},
 {"subjects","SELECT * FROM subjects WHERE (?='' OR code=? OR name LIKE '%'||?||'%') ORDER BY code",0},
 {"semester","SELECT s.*,c.semester,p.name AS program FROM curriculum c JOIN subjects s ON s.id=c.subject_id JOIN programs p ON p.id=c.program_id WHERE p.id=? AND (?=0 OR c.semester=?) ORDER BY c.semester,s.code",0},
 {"syllabus","SELECT * FROM course_units WHERE subject_id=? ORDER BY position",0},
 {"groups","SELECT * FROM groups ORDER BY code",0},
 {"rooms","SELECT * FROM rooms ORDER BY id",0},
 {"offerings","SELECT o.*,s.name AS subject,s.weekly_hours,g.code AS group_code,t.name AS teacher FROM offerings o JOIN subjects s ON s.id=o.subject_id JOIN groups g ON g.id=o.group_id JOIN teachers t ON t.id=o.teacher_id ORDER BY o.id",0},
 {"schedules","SELECT s.*,o.teacher_id,o.group_id,o.subject_id,t.name AS teacher,g.code AS group_code,b.name AS subject,r.name AS room FROM schedules s JOIN offerings o ON o.id=s.offering_id JOIN teachers t ON t.id=o.teacher_id JOIN groups g ON g.id=o.group_id JOIN subjects b ON b.id=o.subject_id JOIN rooms r ON r.id=s.room_id WHERE (?=0 OR o.teacher_id=?) AND (?=0 OR o.group_id=?) AND (?=0 OR EXISTS(SELECT 1 FROM enrollments e WHERE e.offering_id=o.id AND e.student_id=?)) ORDER BY s.starts",0},
 {"grades","SELECT g.*,s.name,COALESCE(a.unexcused,0) AS absences FROM grades g JOIN students s ON s.id=g.student_id LEFT JOIN absence_totals a ON a.student_id=g.student_id AND a.offering_id=g.offering_id WHERE g.offering_id=? ORDER BY s.name",0},
 {"attendance_list","SELECT a.*,s.name FROM attendance a JOIN students s ON s.id=a.student_id WHERE session_id=?",0},
 {"session","SELECT s.*,o.teacher_id,o.group_id,o.subject_id,t.user_id AS teacher_user_id FROM schedules s JOIN offerings o ON o.id=s.offering_id JOIN teachers t ON t.id=o.teacher_id WHERE s.id=?",0},
 {"student_user","SELECT id FROM students WHERE user_id=?",0},
 {"teacher_user","SELECT id FROM teachers WHERE user_id=?",0},
 {"profiles","SELECT u.id AS user_id,u.role,t.id AS teacher_id,COALESCE(t.name,'Administración') AS name,u.password_hash IS NOT NULL AND u.password_hash<>'' AS has_pin FROM users u LEFT JOIN teachers t ON t.user_id=u.id WHERE u.role IN ('admin','teacher') ORDER BY u.role,t.name",0},
 {"profile_user","SELECT u.id,u.role,u.password_hash,t.id AS teacher_id,COALESCE(t.name,'Administración') AS name FROM users u LEFT JOIN teachers t ON t.user_id=u.id WHERE u.id=?",0},
 {"teacher_accounts","SELECT id,name,user_id FROM teachers ORDER BY name",0},
 {"teacher_link","UPDATE teachers SET user_id=? WHERE id=? AND user_id IS NULL",1},
 {"user_pin","UPDATE users SET password_hash=? WHERE id=?",1},
 {"attendance_record","INSERT INTO attendance(session_id,student_id,status,recorded_at,actor_id,confidence) VALUES(?,?,?,?,?,?)",1},
 {"attendance_set","INSERT INTO attendance(session_id,student_id,status,recorded_at,actor_id,note) VALUES(?,?,?,?,?,?) ON CONFLICT(session_id,student_id) DO UPDATE SET status=excluded.status,recorded_at=excluded.recorded_at,actor_id=excluded.actor_id,note=excluded.note",1},
 {"attendance_history","SELECT s.id AS session_id,s.starts,s.ends,s.cancelled,e.student_id,st.number,st.name,a.status,a.note,a.confidence FROM schedules s JOIN enrollments e ON e.offering_id=s.offering_id JOIN students st ON st.id=e.student_id LEFT JOIN attendance a ON a.session_id=s.id AND a.student_id=e.student_id WHERE s.offering_id=? ORDER BY s.starts,st.name",0},
 {"enrolled","SELECT s.id,s.name,b.model,b.encrypted_embedding,b.dimensions,b.expires_at FROM students s JOIN enrollments e ON e.student_id=s.id JOIN schedules sc ON sc.offering_id=e.offering_id LEFT JOIN biometrics b ON b.student_id=s.id WHERE sc.id=?",0},
 {"biometrics","SELECT student_id,model,dimensions,expires_at FROM biometrics",0},
 {"enrollments","SELECT student_id,offering_id FROM enrollments",0},
 {"enrolled_ids","SELECT student_id FROM enrollments WHERE offering_id=?",0},
 {"respondent_consent","UPDATE respondents SET consented_at=? WHERE id=?",1},
 {"availability","SELECT slot FROM availability WHERE teacher_id=? AND shift=?",0},
 {"group_availability","SELECT slot FROM group_availability WHERE group_id=?",0},
 {"surveys","SELECT id,title,created_at FROM surveys WHERE owner_id=? ORDER BY id DESC",0},
 {"survey","SELECT * FROM surveys WHERE id=?",0},
 {"questions","SELECT * FROM questions WHERE survey_id=? ORDER BY id",0},
 {"responses","SELECT r.*,q.prompt,q.kind FROM responses r JOIN questions q ON q.id=r.question_id WHERE q.survey_id=? ORDER BY r.id",0},
 {"codes","SELECT * FROM codes WHERE survey_id=? ORDER BY id",0},
 {"coding","SELECT c.*,k.label FROM coding c JOIN codes k ON k.id=c.code_id WHERE k.survey_id=?",0},
 {"invite_lookup","SELECT * FROM invites WHERE token_hash=? AND expires_at>?",0},
 {"documents","SELECT d.*,s.code FROM documents d LEFT JOIN subjects s ON s.id=d.subject_id ORDER BY d.id",0},
 {"chunks","SELECT * FROM rag_chunks WHERE document_id=? ORDER BY page,id",0},
 {"unembedded","SELECT id,text FROM rag_chunks WHERE embedding IS NULL ORDER BY id LIMIT 100",0},
 {"vectors","SELECT id,text,dimensions,model,hex(embedding) AS vector FROM rag_chunks WHERE model=? AND dimensions=?",0},
 {"rag_text","SELECT c.id,c.text,d.filename,c.page FROM rag_fts f JOIN rag_chunks c ON c.id=f.rowid JOIN documents d ON d.id=c.document_id WHERE rag_fts MATCH ? ORDER BY rank LIMIT 10",0},
 {"operation","SELECT result_json FROM operations WHERE request_id=? AND actor_id=? AND operation=?",0},
 {"events","SELECT e.event_json FROM event_log e JOIN runs r ON r.id=e.run_id WHERE r.actor_id=? ORDER BY json_extract(e.event_json,'$.at') DESC,e.revision DESC LIMIT 100",0},
 {"student_create","INSERT INTO students(number,name,user_id) VALUES(?,?,?)",1},
 {"teacher_update","UPDATE teachers SET name=?,background=?,industry_years=? WHERE id=?",1},
 {"teacher_delete","DELETE FROM teachers WHERE id=?",1},
 {"teacher_create","INSERT INTO teachers(name,background,industry_years,user_id) VALUES(?,?,?,?)",1},
 {"program_create","INSERT INTO programs(name) VALUES(?)",1},
 { "subject_policy","UPDATE subjects SET requirements_json=json_object('min_industry_years',?2,'background_keywords',json(?3)) WHERE id=?1",1},
 {"subject_create","INSERT INTO subjects(code,name,weekly_hours) VALUES(?,?,?)",1},
 {"curriculum_create","INSERT INTO curriculum VALUES(?,?,?)",1},
 {"prerequisite_create","INSERT INTO prerequisites VALUES(?,?)",1},
 {"qualification_create","INSERT INTO teacher_subjects VALUES(?,?,?) ON CONFLICT(teacher_id,subject_id) DO NOTHING",1},
 {"group_create","INSERT INTO groups(code,semester,shift) VALUES(?,?,?)",1},
 {"room_create","INSERT INTO rooms(name,capacity) VALUES(?,?)",1},
 {"offering_create","INSERT INTO offerings(subject_id,group_id,teacher_id,term) VALUES(?,?,?,?)",1},
 {"enroll","INSERT INTO enrollments VALUES(?,?)",1},
 {"unenroll","DELETE FROM enrollments WHERE student_id=? AND offering_id=?",1},
 {"student_update","UPDATE students SET number=?,name=? WHERE id=?",1},
 {"unit_create","INSERT INTO course_units(subject_id,position,title,topics_json) VALUES(?,?,?,?) ON CONFLICT(subject_id,position) DO UPDATE SET title=excluded.title,topics_json=excluded.topics_json",1},
 {"availability_create","INSERT OR IGNORE INTO availability(teacher_id,slot,shift) VALUES(?,?,?)",1},
 {"group_availability_create","INSERT OR IGNORE INTO group_availability VALUES(?,?)",1},
 {"schedule_create","INSERT INTO schedules(offering_id,room_id,starts,ends) VALUES(?,?,?,?)",1},
 {"schedule_close","UPDATE schedules SET closed=1 WHERE id=? AND ends<=?",1},
 {"schedule_cancel","UPDATE schedules SET cancelled=1 WHERE id=?",1},
 {"attendance_create","INSERT INTO attendance(session_id,student_id,status,recorded_at,actor_id) VALUES(?,?,?,?,?)",1},
 {"grade_create","INSERT INTO grades(student_id,offering_id,p1,p2,final_exam,closed_at,approved_by) VALUES(?,?,?,?,?,?,?) ON CONFLICT(student_id,offering_id) DO UPDATE SET p1=excluded.p1,p2=excluded.p2,final_exam=excluded.final_exam,closed_at=excluded.closed_at,approved_by=excluded.approved_by",1},
 {"biometric_create","INSERT INTO biometrics(student_id,model,encrypted_embedding,consented_at,expires_at,dimensions) VALUES(?,?,?,?,?,?) ON CONFLICT(student_id) DO UPDATE SET model=excluded.model,encrypted_embedding=excluded.encrypted_embedding,consented_at=excluded.consented_at,expires_at=excluded.expires_at,dimensions=excluded.dimensions",1},
 {"biometric_delete","DELETE FROM biometrics WHERE student_id=?",1},
 {"survey_create","INSERT INTO surveys(owner_id,title,created_at) VALUES(?,?,?)",1},
 {"question_create","INSERT INTO questions(survey_id,prompt,kind,options_json) VALUES(?,?,?,?)",1},
 {"respondent_create","INSERT INTO respondents(id,survey_id,consented_at) VALUES(?,?,?)",1},
 {"respondent_complete","UPDATE respondents SET completed_at=? WHERE id=?",1},
 {"response_create","INSERT INTO responses(respondent_id,question_id,text,rating,audio_path,submitted_at,transcript) VALUES(?,?,?,?,?,?,?)",1},
 {"invite_create","INSERT INTO invites VALUES(?,?,?,?,?)",1},
 {"code_create","INSERT INTO codes(survey_id,parent_id,label,description) VALUES(?,?,?,?)",1},
 {"code_update","UPDATE codes SET parent_id=?,label=?,description=? WHERE id=? AND survey_id=?",1},
 {"coding_create","INSERT INTO coding VALUES(?,?,?,?,?) ON CONFLICT(response_id,code_id) DO UPDATE SET quote=excluded.quote,confidence=excluded.confidence,reviewed_by=excluded.reviewed_by",1},
 {"run_create","INSERT INTO runs VALUES(?,?,?,?,?)",1},
 {"event_create","INSERT INTO event_log VALUES(?,?,?)",1},
 {"run_update","UPDATE runs SET state=?,revision=? WHERE id=?",1},
 {"audit_create","INSERT INTO audit(actor_id,action,entity,created_at,details_json) VALUES(?,?,?,?,?)",1},
 {"operation_create","INSERT INTO operations VALUES(?,?,?,?,?)",1},
};
static cJSON *memory_info(void){vm_statistics64_data_t stats;mach_msg_type_number_t count=HOST_VM_INFO64_COUNT;vm_size_t page;mach_port_t host=mach_host_self();int rc=host_statistics64(host,HOST_VM_INFO64,(host_info64_t)&stats,&count);host_page_size(host,&page);mach_port_deallocate(mach_task_self(),host);if(rc!=KERN_SUCCESS)return NULL;uint64_t committed=((uint64_t)stats.active_count+stats.wire_count+stats.compressor_page_count)*page;uint64_t physical=0;size_t size=sizeof physical;sysctlbyname("hw.memsize",&physical,&size,NULL,0);cJSON *out=cJSON_CreateObject();cJSON_AddNumberToObject(out,"committedGiB",committed/1073741824.0);cJSON_AddNumberToObject(out,"physicalGiB",physical/1073741824.0);return out;}
static cJSON *dispatch(cJSON *req){
 const char *op=str(req,"op");cJSON *params=cJSON_GetObjectItemCaseSensitive(req,"params");
 if(!strcmp(op,"batch")){cJSON *steps=cJSON_GetObjectItemCaseSensitive(req,"steps"),*step,*out=array();
  if(!cJSON_IsArray(steps)||cJSON_GetArraySize(steps)>10000){cJSON_Delete(out);return NULL;}
  if(sqlite3_exec(db,"BEGIN IMMEDIATE",NULL,NULL,NULL)!=SQLITE_OK){cJSON_Delete(out);return NULL;}
  cJSON_ArrayForEach(step,steps){if(!strcmp(str(step,"op"),"batch")){snprintf(failure,sizeof failure,"Batch anidado no permitido");goto rollback;}cJSON *bound=cJSON_GetObjectItem(step,"params");for(int pi=0;pi<cJSON_GetArraySize(bound);pi++){cJSON *pv=cJSON_GetArrayItem(bound,pi);if(cJSON_IsObject(pv)){cJSON *jsonref=cJSON_GetObjectItem(pv,"$result");cJSON *ref=jsonref?jsonref:cJSON_GetObjectItem(pv,"$ref");if(!cJSON_IsNumber(ref)||ref->valueint<0||ref->valueint>=cJSON_GetArraySize(out))goto rollback;cJSON *source=cJSON_GetArrayItem(out,ref->valueint);if(jsonref){char *encoded=cJSON_PrintUnformatted(source);cJSON_ReplaceItemInArray(bound,pi,cJSON_CreateString(encoded));free(encoded);}else{cJSON *value=cJSON_GetObjectItem(source,"id");if(!cJSON_IsNumber(value))goto rollback;cJSON_ReplaceItemInArray(bound,pi,cJSON_Duplicate(value,1));}}}
 cJSON *v=dispatch(step);if(!v)goto rollback;push(out,v);}
  if(sqlite3_exec(db,"COMMIT",NULL,NULL,NULL)!=SQLITE_OK)goto rollback;return out;
 rollback:sqlite3_exec(db,"ROLLBACK",NULL,NULL,NULL);cJSON_Delete(out);return NULL;
 }
 if(!strcmp(op,"memory"))return memory_info();
 if(!strcmp(op,"ingest"))return ingest_archive(req);
 if(!strcmp(op,"xlsx"))return parse_xlsx(req);
 if(!strcmp(op,"solve"))return native_schedule(req);
 if(!strcmp(op,"search"))return native_search(req);
 if(!strcmp(op,"metrics"))return native_metrics(req);
 if(!strcmp(op,"generate"))return generate_files(req);
 if(!strcmp(op,"match")){
 cJSON *a=cJSON_GetObjectItem(req,"vector"),*candidates=cJSON_GetObjectItem(req,"candidates"),*candidate;float av[512],bv[512];
 if(cJSON_GetArraySize(a)!=512)return NULL;for(int i=0;i<512;i++){cJSON *v=cJSON_GetArrayItem(a,i);if(!cJSON_IsNumber(v)||!isfinite(v->valuedouble))return NULL;av[i]=(float)v->valuedouble;}
 double best=-2,second=-2;int student=0;extern int vector_cosine(const float*,const float*,size_t,double*);
 cJSON_ArrayForEach(candidate,candidates){cJSON *v=cJSON_GetObjectItem(candidate,"vector");if(cJSON_GetArraySize(v)!=512)continue;int valid=1;for(int i=0;i<512;i++){cJSON *x=cJSON_GetArrayItem(v,i);if(!cJSON_IsNumber(x)){valid=0;break;}bv[i]=(float)x->valuedouble;}double score;if(!valid||vector_cosine(av,bv,512,&score))continue;if(score>best){second=best;best=score;student=(int)num(candidate,"studentId");}else if(score>second)second=score;}
 cJSON *out=cJSON_CreateObject();cJSON_AddNumberToObject(out,"studentId",student);cJSON_AddNumberToObject(out,"score",best);cJSON_AddNumberToObject(out,"margin",best-second);return out;
 }
 if(!strcmp(op,"embed")){cJSON *v=cJSON_GetObjectItemCaseSensitive(req,"vector");int n=cJSON_GetArraySize(v);if(n<1||n>4096)return NULL;float *buf=calloc((size_t)n,sizeof(float));if(!buf)return NULL;for(int i=0;i<n;i++){cJSON *x=cJSON_GetArrayItem(v,i);if(!cJSON_IsNumber(x)||!isfinite(x->valuedouble)){free(buf);return NULL;}buf[i]=(float)x->valuedouble;}
  sqlite3_stmt *s=NULL;sqlite3_prepare_v2(db,"UPDATE rag_chunks SET embedding=?,dimensions=?,model=? WHERE id=?",-1,&s,NULL);sqlite3_bind_blob(s,1,buf,n*4,SQLITE_TRANSIENT);sqlite3_bind_int(s,2,n);sqlite3_bind_text(s,3,str(req,"model"),-1,SQLITE_TRANSIENT);sqlite3_bind_int64(s,4,(sqlite3_int64)num(req,"chunkId"));int rc=sqlite3_step(s);free(buf);sqlite3_finalize(s);return rc==SQLITE_DONE?ok_id():NULL;
 }
 for(size_t i=0;i<sizeof operations/sizeof *operations;i++)if(!strcmp(op,operations[i].name))return operations[i].write?(command(operations[i].sql,params)?ok_id():NULL):rows(operations[i].sql,params);
 snprintf(failure,sizeof failure,"Operacion nativa desconocida");return NULL;
}
static char *read_file(const char *p){FILE *f=fopen(p,"rb");if(!f)return NULL;fseek(f,0,SEEK_END);long n=ftell(f);rewind(f);if(n<0||n>2000000){fclose(f);return NULL;}char *s=calloc((size_t)n+1,1);if(s&&fread(s,1,(size_t)n,f)!=(size_t)n){free(s);s=NULL;}fclose(f);return s;}
int main(int argc,char **argv){
 if(argc==2&&!strcmp(argv[1],"--memory")){cJSON *m=memory_info();char *json=cJSON_PrintUnformatted(m);if(json)puts(json);free(json);cJSON_Delete(m);return m?0:1;}
 if(argc<2)return 2;if(sqlite3_open(argv[1],&db)!=SQLITE_OK)return 2;
 if(sqlite3_vec_init(db,NULL,NULL)!=SQLITE_OK){fprintf(stderr,"No se pudo inicializar sqlite-vec\n");return 2;}
 sqlite3_exec(db,"PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;PRAGMA journal_mode=WAL;PRAGMA cache_size=-32768;",NULL,NULL,NULL);
 if(argc>=4&&!strcmp(argv[2],"--init")){char *schema=read_file(argv[3]);int rc=schema?sqlite3_exec(db,schema,NULL,NULL,NULL):SQLITE_ERROR;free(schema);if(rc!=SQLITE_OK){fprintf(stderr,"%s\n",sqlite3_errmsg(db));return 1;}sqlite3_close(db);return 0;}
 char *line=NULL;size_t cap=0;ssize_t len;
 while((len=getline(&line,&cap,stdin))!=-1){failure[0]=0;cJSON *req=len<=16000000?cJSON_Parse(line):NULL; cJSON *value=req?dispatch(req):NULL,*answer=cJSON_CreateObject();
  cJSON_AddItemToObject(answer,"id",cJSON_Duplicate(cJSON_GetObjectItemCaseSensitive(req,"id"),1));
  if(value){cJSON_AddBoolToObject(answer,"ok",1);cJSON_AddItemToObject(answer,"result",value);}else{cJSON_AddBoolToObject(answer,"ok",0);cJSON_AddStringToObject(answer,"error",failure[0]?failure:"Operacion invalida o limite excedido");}
  char *s=cJSON_PrintUnformatted(answer);if(s){puts(s);fflush(stdout);free(s);}cJSON_Delete(answer);cJSON_Delete(req);
 }free(line);sqlite3_close(db);return 0;
}
