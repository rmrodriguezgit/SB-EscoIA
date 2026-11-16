import { z } from "zod";
export const id = z.number().int().positive();
export const requestId = z.string().uuid();
const text = z.string().trim().min(1).max(1000),
  token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const payloads = {
  mcp_curriculum_tool: z.discriminatedUnion("action", [
    z.object({
      action: z.literal("lookup"),
      query: z.string().min(1).max(2000),
    }),
    z.object({
      action: z.literal("subjects"),
      query: z.string().max(200).default(""),
    }),
    z.object({
      action: z.literal("semester"),
      programId: id,
      semester: z.number().int().min(0).max(12),
    }),
    z.object({ action: z.literal("syllabus"), subjectId: id }),
    z.object({
      action: z.literal("search"),
      query: z.string().min(1).max(2000),
      semantic: z.boolean().default(false),
    }),
    z.object({
      action: z.literal("ingest"),
      uploadId: z.string().uuid(),
      subjectId: id.optional(),
    }),
    z.object({ action: z.literal("index") }),
    z.object({ action: z.literal("plan"), subjectId: id }),
    z.object({
      action: z.literal("activity"),
      subjectId: id,
      referenceQuery: text,
      notebookKind: z.enum(["finance", "statistics"]).default("finance"),
    }),
  ]),
  mcp_scheduler_tool: z.discriminatedUnion("action", [
    z.object({
      action: z.literal("list"),
      teacherId: z.number().int().min(0).default(0),
      groupId: z.number().int().min(0).default(0),
      studentId: z.number().int().min(0).default(0),
    }),
    z.object({
      action: z.literal("solve"),
      offeringIds: z.array(id).min(1).max(64),
      slotStarts: z.array(z.number().int().positive()).length(40),
      duration: z.number().int().min(1).max(8).default(1),
      commit: z.boolean().default(false),
    }),
    z.object({ action: z.literal("close"), sessionId: id }),
    z.object({ action: z.literal("cancel"), sessionId: id }),
  ]),
  mcp_biometrics_tool: z.discriminatedUnion("action", [
    z.object({ action: z.literal("sessions"), query: z.string().max(2000) }),
    z.object({
      action: z.literal("enroll"),
      studentId: id,
      studentNumber: z.string().min(1).max(80).optional(),
      sessionId: id.optional(),
      frame: z.string().max(2000000),
      consent: z.literal(true),
    }),
    z.object({ action: z.literal("delete"), studentId: id }),
    z.object({
      action: z.literal("manual"),
      sessionId: id,
      studentId: id,
      status: z.enum(["present", "excused", "absent"]),
      reason: text,
    }),
    z.object({
      action: z.literal("verify"),
      sessionId: id,
      challengeId: z.string().uuid(),
      frames: z.array(z.string().max(2000000)).min(1).max(3).refine(a => a.length === 1 || a.length === 3),
      captureMode: z.enum(["single", "gesture", "passive"]).default("gesture"),
      supervised: z.literal(true),
    }),
  ]),
  mcp_grades_tool: z.discriminatedUnion("action", [
    z.object({ action: z.literal("list"), offeringId: id }),
    z.object({
      action: z.literal("preview"),
      uploadId: z.string().uuid(),
      offeringId: id,
    }),
    z.object({
      action: z.literal("commit"),
      previewId: z.string().uuid(),
      approved: z.literal(true),
    }),
  ]),
  mcp_surveys_tool: z.discriminatedUnion("action", [
    z.object({
      action: z.literal("create"),
      title: text,
      questions: z
        .array(
          z.object({
            prompt: text,
            kind: z.enum(["text", "rating", "choice", "audio"]),
            options: z.array(text).max(20).optional(),
          }),
        )
        .min(1)
        .max(50),
    }),
    z.object({
      action: z.literal("analyze"),
      surveyId: id,
      qualitative: z.boolean().default(false),
    }),
    z.object({
      action: z.literal("invite"),
      surveyId: id,
      count: z.number().int().min(1).max(100),
    }),
    z.object({
      action: z.literal("code"),
      surveyId: id,
      label: text,
      parentId: id.nullable().default(null),
      description: z.string().max(2000).default(""),
    }),
    z.object({
      action: z.literal("code_update"),
      surveyId: id,
      codeId: id,
      label: text,
      parentId: id.nullable().default(null),
      description: z.string().max(2000).default(""),
    }),
    z.object({
      action: z.literal("review"),
      surveyId: id,
      responseId: id,
      codeId: id,
      quote: z.string().max(10000),
      confidence: z.number().min(0).max(1),
    }),
    z.object({
      action: z.literal("report"),
      surveyId: id,
      narrative: z.string().max(30000).default(""),
    }),
  ]),
};
export const submission = z.object({
  token,
  consent: z.literal(true),
  answers: z
    .array(
      z.object({
        questionId: id,
        text: z.string().max(10000).optional(),
        rating: z.number().min(1).max(5).optional(),
        uploadId: z.string().uuid().optional(),
      }),
    )
    .min(1)
    .max(50),
});
export const recordSchemas: Record<string, z.ZodTypeAny> = {
  student_create: z.tuple([text, text, id.nullable()]),
  teacher_update: z.tuple([text, text, z.number().int().min(0).max(80), id]),
  teacher_delete: z.tuple([id]),
  schedule_create: z
    .tuple([id, id, z.number().int().positive(), z.number().int().positive()])
    .refine((p) => p[3] > p[2], "La sesión debe terminar después del inicio"),
  teacher_create: z.tuple([
    text,
    text,
    z.number().int().min(0).max(80),
    id.nullable(),
  ]),
  subject_policy: z.tuple([
    id,
    z.number().int().min(0).max(80),
    z
      .string()
      .max(5000)
      .refine((s) => {
        try {
          const a = JSON.parse(s);
          return (
            Array.isArray(a) &&
            a.every((x) => typeof x === "string" && x.length > 0)
          );
        } catch {
          return false;
        }
      }),
  ]),
  program_create: z.tuple([text]),
  subject_create: z.tuple([text, text, z.number().int().min(1).max(40)]),
  curriculum_create: z.tuple([id, id, z.number().int().min(1).max(12)]),
  prerequisite_create: z.tuple([id, id]),
  qualification_create: z.tuple([id, id]),
  group_create: z
    .tuple([
      z.string().regex(/^(?:(?:LAR|LAN|LCP|LNI|LNV|LTH)-)?[1-9][01]\d$/),
      z.number().int().min(1).max(9),
      z.enum(["morning", "evening"]),
    ])
    .refine(
      ([code, semester, shift]) =>
        Number(code.slice(-3)[0]) === semester &&
        (code.slice(-3)[1] === "0" ? "morning" : "evening") === shift,
    ),
  room_create: z.tuple([text, z.number().int().min(1).max(1000)]),
  offering_create: z.tuple([id, id, id, text]),
  enroll: z.tuple([id, id]),
  unit_create: z.tuple([
    id,
    z.number().int().min(1).max(100),
    text,
    z
      .string()
      .max(30000)
      .refine((s) => {
        try {
          return Array.isArray(JSON.parse(s));
        } catch {
          return false;
        }
      }),
  ]),
  availability_create: z.tuple([
    id,
    z.number().int().min(0).max(39),
    z.enum(["morning", "evening"]),
  ]),
  group_availability_create: z.tuple([id, z.number().int().min(0).max(39)]),
};
