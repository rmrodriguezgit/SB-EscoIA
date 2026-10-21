"""Proceso aislado: al salir libera todos los pesos y caché Metal."""
import asyncio,json,sys,os
from pathlib import Path
for key in ('MIRAI_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY','XAI_API_KEY','BASETEN_API_KEY','OPENROUTER_API_KEY'):
 os.environ.pop(key,None)
from uzu import Engine,EngineConfig,ChatConfig,ChatMessage,ChatReplyConfig,ContextLength,Grammar,ReasoningEffort,DownloadPhase,DownloadManagerType
HOME=Path(__file__).resolve().parents[1]
MODEL='alibaba:qwen3.5:0.8b:mirai:mirai-m:4'
async def main():
 (HOME/'data/uzu').mkdir(parents=True,exist_ok=True)
 config=EngineConfig.create().with_download_manager_type(DownloadManagerType.Universal).with_local_path(str(HOME/'data/uzu')).with_allow_ollama_usage(False).with_allow_lmstudio_usage(False)
 engine=await Engine.create(config)
 model=await engine.model(MODEL)
 if model is None:raise RuntimeError('Modelo Uzu no disponible en el registro')
 if '--download' in sys.argv:
  (HOME/'data/uzu-ready.json').unlink(missing_ok=True)
  async for update in (await engine.download(model)).iterator():
   if isinstance(update.phase,DownloadPhase.Error):raise RuntimeError(update.phase.message)
   print(f'Descarga: {update.progress:.0%}',file=sys.stderr)
  state=await engine.download_state(model)
  if state is None or not isinstance(state.phase,DownloadPhase.Downloaded):raise RuntimeError('Descarga Uzu incompleta: '+str(state))
  (HOME/'data/uzu-ready.json').write_text(json.dumps({'model':MODEL,'version':'0.6.3'}))
  print(json.dumps({'downloaded':MODEL}));return
 payload=json.load(sys.stdin)
 messages=[]
 for item in payload['messages']:
  factory={'system':ChatMessage.system,'user':ChatMessage.user,'assistant':ChatMessage.assistant}.get(item['role'])
  if factory is None:raise ValueError('Rol no permitido')
  message=factory().with_text(item['content'])
  if item['role']=='system':message=message.with_reasoning_effort(ReasoningEffort.Disabled)
  messages.append(message)
 # uzu 0.6.3 exige ContextLength; un int lanza TypeError antes de cargar pesos.
 session=await engine.chat(model,ChatConfig.create().with_context_length(ContextLength.Custom(4096)))
 reply_config=ChatReplyConfig.create().with_token_limit(min(1200,int(payload.get('options',{}).get('num_predict',900))))
 if isinstance(payload.get('format'),dict):reply_config=reply_config.with_grammar(Grammar.JsonSchema(json.dumps(payload['format'])))
 replies=await session.reply(messages,reply_config)
 if not replies or not replies[-1].message.text:raise RuntimeError('Uzu devolvió una respuesta vacía')
 print(json.dumps({'message':{'role':'assistant','content':replies[-1].message.text}},ensure_ascii=False))
asyncio.run(asyncio.wait_for(main(),timeout=1800 if "--download" in sys.argv else 115))
