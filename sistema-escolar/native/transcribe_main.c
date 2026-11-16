#include <whisper.h>
#include <stdio.h>
#include <stdlib.h>
#include <math.h>
int transcribe_pcm(struct whisper_context *,const float *,size_t,char *,size_t);
int main(int argc,char **argv){if(argc!=3)return 2;FILE *f=fopen(argv[2],"rb");if(!f)return 2;fseek(f,0,SEEK_END);long bytes=ftell(f);rewind(f);if(bytes<=0||bytes%4||bytes>16000*30*4){fclose(f);return 2;}float *pcm=malloc((size_t)bytes);if(!pcm){fclose(f);return 2;}if(fread(pcm,1,(size_t)bytes,f)!=(size_t)bytes){free(pcm);fclose(f);return 2;}fclose(f);
 struct whisper_context_params params=whisper_context_default_params();params.use_gpu=true;struct whisper_context *ctx=whisper_init_from_file_with_params(argv[1],params);if(!ctx){free(pcm);return 2;}char text[65536];int rc=transcribe_pcm(ctx,pcm,(size_t)bytes/4,text,sizeof text);if(!rc)puts(text);whisper_free(ctx);free(pcm);return rc?1:0;}
