PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS research_studies(id TEXT PRIMARY KEY,title TEXT NOT NULL,phase INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0,definition_json TEXT NOT NULL,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS research_questions(id TEXT NOT NULL,study_id TEXT NOT NULL REFERENCES research_studies(id),position INTEGER NOT NULL,question_json TEXT NOT NULL,PRIMARY KEY(study_id,id));
CREATE TABLE IF NOT EXISTS research_participants(id TEXT NOT NULL,study_id TEXT NOT NULL REFERENCES research_studies(id),qualitative INTEGER NOT NULL,consent INTEGER NOT NULL,answers_json TEXT NOT NULL,updated TEXT NOT NULL,PRIMARY KEY(study_id,id));
CREATE TABLE IF NOT EXISTS research_analyses(id TEXT PRIMARY KEY,study_id TEXT NOT NULL REFERENCES research_studies(id),revision INTEGER NOT NULL,result_json TEXT NOT NULL,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS research_jobs(id TEXT PRIMARY KEY,study_id TEXT NOT NULL REFERENCES research_studies(id),status TEXT NOT NULL,error TEXT,analysis_id TEXT,updated TEXT NOT NULL);
