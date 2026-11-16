#include "scheduler_core.h"
#include <stdlib.h>
#include <string.h>
typedef struct { const sc_request *q; const sc_room *r; size_t n,nr;
 sc_assignment *a; unsigned char *done; uint64_t *busy; uint64_t left; int exhausted; } search;
static uint64_t mask(unsigned s,unsigned d) { return d==64 ? UINT64_MAX : ((UINT64_C(1)<<d)-1)<<s; }
static int fits(search *x,size_t i,unsigned s,size_t r) {
 const sc_request *q=&x->q[i]; if(q->day_slots && s%q->day_slots+q->duration>q->day_slots) return 0; uint64_t m=mask(s,q->duration);
 if(!q->qualified || x->r[r].capacity<q->capacity || (q->allowed&m)!=m ||
    (x->r[r].available&m)!=m || (x->busy[r]&m)) return 0;
 for(size_t j=0;j<x->n;j++) if(x->done[j] &&
  (x->q[j].teacher==q->teacher || x->q[j].group==q->group || ((q->conflicts[j/64]>>(j%64))&1)) &&
  (mask(x->a[j].slot,x->q[j].duration)&m)) return 0;
 return 1;
}
static int dfs(search *x,size_t depth) {
 if(depth==x->n) return 1;
 if(!x->left) { x->exhausted=1; return 0; } --x->left;
 size_t best=x->n; unsigned min=~0u;
 for(size_t i=0;i<x->n;i++) if(!x->done[i]) {
  unsigned count=0;
  for(unsigned s=0;s<=64-x->q[i].duration;s++) for(size_t r=0;r<x->nr;r++) count+=fits(x,i,s,r);
  if(!count) return 0;
  if(count<min) { min=count; best=i; }
 }
 for(unsigned s=0;s<=64-x->q[best].duration;s++) for(size_t r=0;r<x->nr;r++) if(fits(x,best,s,r)) {
  uint64_t m=mask(s,x->q[best].duration); x->a[best]=(sc_assignment){s,(unsigned)r};
  x->done[best]=1; x->busy[r]|=m;
  if(dfs(x,depth+1)) return 1;
  x->busy[r]&=~m; x->done[best]=0;
  if(x->exhausted) return 0;
 }
 return 0;
}
int sc_solve(const sc_request *q,size_t n,const sc_room *r,size_t nr,sc_assignment *out,uint64_t budget) {
 if(!q||!r||!out||!n||n>256||!nr||nr>128||!budget) return -1;
 for(size_t i=0;i<n;i++) if(!q[i].duration||q[i].duration>64) return -1;
 search x={.q=q,.r=r,.n=n,.nr=nr,.left=budget};
 x.a=calloc(n,sizeof *x.a); x.done=calloc(n,1); x.busy=calloc(nr,sizeof *x.busy);
 if(!x.a||!x.done||!x.busy) { free(x.a);free(x.done);free(x.busy);return -1; }
 int ok=dfs(&x,0); if(ok) memcpy(out,x.a,n*sizeof *out);
 free(x.a);free(x.done);free(x.busy);return ok?0:x.exhausted?2:1;
}
