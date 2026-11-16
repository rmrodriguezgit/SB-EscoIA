-- v3 (2026-11-16): asistencia con «Retardo» (late), nota de justificación para ediciones
-- manuales y confianza del reconocimiento facial. Un retardo cuenta como asistencia.
BEGIN IMMEDIATE;
DROP VIEW absence_totals;
DROP TRIGGER attendance_enrollment;
ALTER TABLE attendance RENAME TO attendance_v2;
CREATE TABLE attendance(session_id INTEGER REFERENCES schedules,student_id INTEGER REFERENCES students,status TEXT NOT NULL CHECK(status IN ('present','late','excused','absent')),recorded_at INTEGER NOT NULL,actor_id INTEGER REFERENCES users,note TEXT,confidence REAL CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1),PRIMARY KEY(session_id,student_id));
INSERT INTO attendance(session_id,student_id,status,recorded_at,actor_id) SELECT session_id,student_id,status,recorded_at,actor_id FROM attendance_v2;
DROP TABLE attendance_v2;
CREATE TRIGGER attendance_enrollment BEFORE INSERT ON attendance BEGIN
 SELECT RAISE(ABORT,'not enrolled') WHERE NOT EXISTS(SELECT 1 FROM enrollments e JOIN schedules s ON s.offering_id=e.offering_id WHERE s.id=NEW.session_id AND e.student_id=NEW.student_id); END;
CREATE VIEW absence_totals AS SELECT g.student_id,g.offering_id,SUM(CASE WHEN s.id IS NOT NULL AND (a.status='absent' OR a.status IS NULL) THEN 1 ELSE 0 END) AS unexcused FROM grades g LEFT JOIN schedules s ON s.offering_id=g.offering_id AND s.ends<=g.closed_at AND s.closed=1 AND s.cancelled=0 LEFT JOIN attendance a ON a.session_id=s.id AND a.student_id=g.student_id GROUP BY g.student_id,g.offering_id;
PRAGMA user_version=3;
COMMIT;
