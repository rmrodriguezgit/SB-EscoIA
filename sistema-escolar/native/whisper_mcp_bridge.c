/* C ABI client; link to whisper.cpp's C++ library. Input: mono float32 PCM,
   16 kHz, normalized [-1,1]. Browser WebM/Opus must be decoded first. */
#include <stddef.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
#include <limits.h>
#ifdef WITH_WHISPER
#include "whisper.h"
int transcribe_pcm(struct whisper_context *ctx,const float *pcm,size_t n,char *out,size_t cap) {
 if(!ctx||!pcm||!out||!cap||!n||n>16000*30||n>INT_MAX) return -1;
 for(size_t i=0;i<n;i++) if(!isfinite(pcm[i])||fabsf(pcm[i])>1) return -1;
 struct whisper_full_params p=whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
 p.n_threads=4;p.language="es";p.print_progress=false;p.print_realtime=false;p.print_timestamps=false;
 if(whisper_full(ctx,p,pcm,(int)n)) return -2;
 size_t used=0;out[0]=0;
 for(int i=0;i<whisper_full_n_segments(ctx);i++) {
  const char *s=whisper_full_get_segment_text(ctx,i);size_t len=strlen(s);
  if(len>=cap-used) {out[0]=0;return -3;} memcpy(out+used,s,len+1);used+=len;
 } return 0;
}
#endif
/* Matching only, NOT extraction or liveness. Threshold must be calibrated
   for the chosen embedding model, camera, and enrolled population. */
int vector_cosine(const float *a,const float *b,size_t n,double *out) {
 if(!a||!b||!out||n!=512) return -1;
 double aa=0,bb=0,ab=0;
 for(size_t i=0;i<n;i++){if(!isfinite(a[i])||!isfinite(b[i]))return -1;aa+=a[i]* (double)a[i];bb+=b[i]*(double)b[i];ab+=a[i]*(double)b[i];}
 if(aa<=0||bb<=0)return -1;*out=ab/sqrt(aa*bb);return 0;
}
