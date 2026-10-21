#include <math.h>
#include <stddef.h>
int grade_weighted(double p1,double p2,double final,double *out){
 if(!out||!isfinite(p1)||!isfinite(p2)||!isfinite(final)||p1<0||p1>100||p2<0||p2>100||final<0||final>100)return -1;
 *out=.2*p1+.2*p2+.6*final;return 0;
}
int sample_metrics(const double *values,size_t n,double *mean,double *variance){
 if(!values||!n||!mean||!variance)return -1;double m=0,s=0;
 for(size_t i=0;i<n;i++){if(!isfinite(values[i]))return -1;double d=values[i]-m;m+=d/(i+1);s+=d*(values[i]-m);}
 *mean=m;*variance=n>1?s/(n-1):0;return 0;
}
