#ifndef SCHEDULER_CORE_H
#define SCHEDULER_CORE_H
#include <stdint.h>
#include <stddef.h>
#define SC_SLOTS 64
/* Each request is one session. allowed includes all teacher/group constraints.
   qualified is established from a trusted teacher-subject profile lookup. */
typedef struct { unsigned teacher, group, duration, capacity; uint64_t allowed; int qualified; unsigned day_slots; uint64_t conflicts[4]; } sc_request;
typedef struct { unsigned capacity; uint64_t available; } sc_room;
typedef struct { unsigned slot, room; } sc_assignment;
/* 0 success, 1 infeasible, 2 budget exhausted, -1 invalid. Output valid only on 0. */
int sc_solve(const sc_request *, size_t, const sc_room *, size_t,
             sc_assignment *, uint64_t budget);
#endif
