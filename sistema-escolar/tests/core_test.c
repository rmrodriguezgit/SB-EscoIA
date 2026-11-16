#include "../native/scheduler_core.h"
#include <assert.h>
#include <math.h>
int vector_cosine(const float*,const float*,size_t,double*);
int grade_weighted(double,double,double,double*);
int main(void){
 sc_room r[]={{30,15}};sc_request q[]={{1,1,2,20,15,1},{1,2,2,20,15,1}};sc_assignment a[2];
 assert(sc_solve(q,2,r,1,a,100)==0);assert(a[0].slot!=a[1].slot);
 q[1].allowed=3; q[0].allowed=3;assert(sc_solve(q,2,r,1,a,100)==1);
 q[0].duration=0;assert(sc_solve(q,2,r,1,a,100)==-1);
 q[0].duration=2;q[0].allowed=15;q[1].allowed=15;assert(sc_solve(q,2,r,1,a,1)==2);
 float v[512]={1},w[512]={1};double z;assert(!vector_cosine(v,w,512,&z)&&fabs(z-1)<1e-9);
 w[0]=NAN;assert(vector_cosine(v,w,512,&z)==-1);
 assert(!grade_weighted(80,90,100,&z)&&fabs(z-94)<1e-9);assert(grade_weighted(NAN,90,100,&z)==-1);
 return 0;
}
