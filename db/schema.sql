PRAGMA foreign_keys=ON;
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
CREATE TABLE users(id INTEGER PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('admin','teacher','student','researcher')), external_id TEXT UNIQUE NOT NULL);
CREATE TABLE students(id INTEGER PRIMARY KEY, user_id INTEGER UNIQUE REFERENCES users, number TEXT UNIQUE NOT NULL, name TEXT NOT NULL);
CREATE TABLE teachers(id INTEGER PRIMARY KEY,user_id INTEGER UNIQUE REFERENCES users,name TEXT NOT NULL,background TEXT NOT NULL,industry_years INTEGER NOT NULL CHECK(industry_years>=0));
CREATE TABLE programs(id INTEGER PRIMARY KEY,name TEXT UNIQUE NOT NULL);
CREATE TABLE subjects(id INTEGER PRIMARY KEY,code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,weekly_hours INTEGER NOT NULL CHECK(weekly_hours>0));
CREATE TABLE curriculum(program_id INTEGER REFERENCES programs,subject_id INTEGER REFERENCES subjects,semester INTEGER CHECK(semester BETWEEN 1 AND 12),PRIMARY KEY(program_id,subject_id));
CREATE TABLE prerequisites(subject_id INTEGER REFERENCES subjects,requires_id INTEGER REFERENCES subjects,CHECK(subject_id<>requires_id),PRIMARY KEY(subject_id,requires_id));
CREATE TABLE teacher_subjects(teacher_id INTEGER REFERENCES teachers,subject_id INTEGER REFERENCES subjects,verified_by INTEGER REFERENCES users,PRIMARY KEY(teacher_id,subject_id));
CREATE TABLE groups(id INTEGER PRIMARY KEY,code TEXT UNIQUE NOT NULL,semester INTEGER NOT NULL,shift TEXT CHECK(shift IN ('morning','evening')));
CREATE TABLE rooms(id INTEGER PRIMARY KEY,name TEXT UNIQUE,capacity INTEGER CHECK(capacity>0));
CREATE TABLE offerings(id INTEGER PRIMARY KEY,subject_id INTEGER REFERENCES subjects,group_id INTEGER REFERENCES groups,teacher_id INTEGER REFERENCES teachers,term TEXT NOT NULL,UNIQUE(subject_id,group_id,term));
CREATE TABLE enrollments(student_id INTEGER REFERENCES students,offering_id INTEGER REFERENCES offerings,PRIMARY KEY(student_id,offering_id));
/* UTC epoch seconds for dated sessions; repeating templates are expanded using
   the institution IANA timezone, including holidays, before persistence. */
CREATE TABLE schedules(id INTEGER PRIMARY KEY,offering_id INTEGER NOT NULL REFERENCES offerings,room_id INTEGER NOT NULL REFERENCES rooms,starts INTEGER NOT NULL,ends INTEGER NOT NULL,CHECK(ends>starts));
CREATE TRIGGER schedule_conflict BEFORE INSERT ON schedules BEGIN
 SELECT RAISE(ABORT,'schedule conflict') WHERE EXISTS(
 SELECT 1 FROM schedules s JOIN offerings a ON a.id=s.offering_id JOIN offerings b ON b.id=NEW.offering_id
 WHERE s.starts<NEW.ends AND s.ends>NEW.starts AND (s.room_id=NEW.room_id OR a.teacher_id=b.teacher_id OR a.group_id=b.group_id)); END;
CREATE TRIGGER schedule_update_conflict BEFORE UPDATE ON schedules BEGIN
 SELECT RAISE(ABORT,'schedule conflict') WHERE EXISTS(
 SELECT 1 FROM schedules s JOIN offerings a ON a.id=s.offering_id JOIN offerings b ON b.id=NEW.offering_id
 WHERE s.id<>NEW.id AND s.starts<NEW.ends AND s.ends>NEW.starts AND (s.room_id=NEW.room_id OR a.teacher_id=b.teacher_id OR a.group_id=b.group_id)); END;
CREATE TABLE biometrics(student_id INTEGER PRIMARY KEY REFERENCES students,model TEXT NOT NULL,encrypted_embedding BLOB NOT NULL,consented_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE attendance(session_id INTEGER REFERENCES schedules,student_id INTEGER REFERENCES students,status TEXT NOT NULL CHECK(status IN ('present','excused','absent')),recorded_at INTEGER NOT NULL,actor_id INTEGER REFERENCES users,PRIMARY KEY(session_id,student_id));
CREATE TRIGGER attendance_enrollment BEFORE INSERT ON attendance BEGIN
 SELECT RAISE(ABORT,'not enrolled') WHERE NOT EXISTS(SELECT 1 FROM enrollments e JOIN schedules s ON s.offering_id=e.offering_id WHERE s.id=NEW.session_id AND e.student_id=NEW.student_id); END;
CREATE TABLE grades(student_id INTEGER,offering_id INTEGER,p1 REAL NOT NULL CHECK(p1 BETWEEN 0 AND 100),p2 REAL NOT NULL CHECK(p2 BETWEEN 0 AND 100),final_exam REAL NOT NULL CHECK(final_exam BETWEEN 0 AND 100),total REAL GENERATED ALWAYS AS (p1*.2+p2*.2+final_exam*.6) STORED,closed_at INTEGER,approved_by INTEGER REFERENCES users,PRIMARY KEY(student_id,offering_id),FOREIGN KEY(student_id,offering_id) REFERENCES enrollments);
CREATE VIEW absence_totals AS SELECT g.student_id,g.offering_id,COUNT(s.id) AS unexcused FROM grades g LEFT JOIN schedules s ON s.offering_id=g.offering_id AND s.ends<=g.closed_at LEFT JOIN attendance a ON a.session_id=s.id AND a.student_id=g.student_id WHERE s.id IS NOT NULL AND (a.status='absent' OR a.status IS NULL) GROUP BY g.student_id,g.offering_id;
CREATE TABLE documents(id INTEGER PRIMARY KEY,sha256 TEXT UNIQUE NOT NULL,filename TEXT NOT NULL,subject_id INTEGER REFERENCES subjects);
CREATE TABLE rag_chunks(id INTEGER PRIMARY KEY,document_id INTEGER REFERENCES documents,page INTEGER,text TEXT NOT NULL,embedding BLOB,model TEXT,dimensions INTEGER,CHECK(embedding IS NULL OR length(embedding)=dimensions*4));
CREATE VIRTUAL TABLE rag_fts USING fts5(text,content='rag_chunks',content_rowid='id');
CREATE TRIGGER rag_insert AFTER INSERT ON rag_chunks BEGIN INSERT INTO rag_fts(rowid,text) VALUES(NEW.id,NEW.text); END;
CREATE TRIGGER rag_delete AFTER DELETE ON rag_chunks BEGIN INSERT INTO rag_fts(rag_fts,rowid,text) VALUES('delete',OLD.id,OLD.text); END;
CREATE TRIGGER rag_update AFTER UPDATE ON rag_chunks BEGIN INSERT INTO rag_fts(rag_fts,rowid,text) VALUES('delete',OLD.id,OLD.text);INSERT INTO rag_fts(rowid,text) VALUES(NEW.id,NEW.text); END;
CREATE TABLE surveys(id INTEGER PRIMARY KEY,owner_id INTEGER REFERENCES users,title TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE questions(id INTEGER PRIMARY KEY,survey_id INTEGER REFERENCES surveys,prompt TEXT NOT NULL,kind TEXT CHECK(kind IN ('text','rating','choice','audio')),options_json TEXT CHECK(options_json IS NULL OR json_valid(options_json)));
CREATE TABLE respondents(id TEXT PRIMARY KEY,survey_id INTEGER REFERENCES surveys,consented_at INTEGER NOT NULL,UNIQUE(id,survey_id));
CREATE TABLE responses(id INTEGER PRIMARY KEY,respondent_id TEXT REFERENCES respondents,question_id INTEGER REFERENCES questions,text TEXT,rating REAL,audio_path TEXT,submitted_at INTEGER NOT NULL,UNIQUE(respondent_id,question_id));
CREATE TRIGGER response_scope BEFORE INSERT ON responses BEGIN SELECT RAISE(ABORT,'survey mismatch') WHERE NOT EXISTS(SELECT 1 FROM respondents r JOIN questions q ON r.survey_id=q.survey_id WHERE r.id=NEW.respondent_id AND q.id=NEW.question_id); END;
CREATE TABLE codes(id INTEGER PRIMARY KEY,survey_id INTEGER REFERENCES surveys,parent_id INTEGER REFERENCES codes,label TEXT NOT NULL);
CREATE TABLE coding(response_id INTEGER REFERENCES responses,code_id INTEGER REFERENCES codes,quote TEXT NOT NULL,confidence REAL CHECK(confidence BETWEEN 0 AND 1),reviewed_by INTEGER REFERENCES users,PRIMARY KEY(response_id,code_id));
CREATE TABLE audit(id INTEGER PRIMARY KEY,actor_id INTEGER REFERENCES users,action TEXT NOT NULL,entity TEXT NOT NULL,created_at INTEGER NOT NULL,details_json TEXT CHECK(json_valid(details_json)));
CREATE TABLE runs(id TEXT PRIMARY KEY,actor_id INTEGER REFERENCES users,state TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
