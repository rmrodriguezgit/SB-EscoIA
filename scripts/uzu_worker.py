"""Proceso aislado: al salir libera todos los pesos y caché Metal."""
import asyncio,json,re,sys,os
from pathlib import Path
HOME=Path(__file__).resolve().parents[1]
MODEL='alibaba:qwen3.5:0.8b:mirai:mirai-m:4'
TYPES={'string':str,'integer':int,'number':(int,float),'boolean':bool,'array':list,'object':dict}

def schema_prompt(schema):
 # uzu 0.6.3 acepta Grammar.JsonSchema pero no restringe la salida (verificado 2026-10-21):
 # el formato también se pide en el prompt y se valida después.
 return '\n\nResponde únicamente con un objeto JSON válido que cumpla este esquema, sin bloques de código ni texto adicional:\n'+json.dumps(schema,ensure_ascii=False)

def typed(value,spec):
 kind=spec.get('type')
 if kind in ('integer','number') and isinstance(value,bool):return False
 if not isinstance(value,TYPES.get(kind,object)):return False
 if kind=='array':return all(typed(v,spec.get('items',{})) for v in value)
 if kind=='object' and 'properties' in spec:return matches(value,spec)
 return True

def matches(value,schema):
 if not isinstance(value,dict):return False
 props=schema.get('properties',{})
 if any(k not in value for k in schema.get('required',[])):return False
 if schema.get('additionalProperties') is False and set(value)-set(props):return False
 return all(typed(value[k],p) for k,p in props.items() if k in value)

def coerce_json(text,schema):
 """Devuelve JSON (str) que cumple el esquema o lanza ValueError. Nunca inventa campos."""
 clean=re.sub(r'```(?:json)?','',text or '').strip()
 decoder=json.JSONDecoder()
 for match in re.finditer(r'\{',clean):
  try:value,_=decoder.raw_decode(clean[match.start():])
  except json.JSONDecodeError:continue
  if matches(value,schema):return json.dumps(value,ensure_ascii=False)
 props=schema.get('properties',{})
 # Esquema de un único campo de texto: el texto plano es la respuesta, sin restos de JSON.
 if len(props)==1 and next(iter(props.values())).get('type')=='string' and clean and '{' not in clean:
  return json.dumps({next(iter(props)):clean},ensure_ascii=False)
 raise ValueError('Uzu no devolvió JSON válido para el esquema solicitado')

async def main():
 from uzu import Engine,EngineConfig,ChatConfig,ChatMessage,ChatReplyConfig,ContextLength,Grammar,ReasoningEffort,DownloadPhase,DownloadManagerType
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
 schema=payload.get('format') if isinstance(payload.get('format'),dict) else None
 items=[dict(item) for item in payload['messages']]
 if schema:
  last=max((i for i,item in enumerate(items) if item['role']=='user'),default=None)
  if last is None:items.append({'role':'user','content':schema_prompt(schema).strip()})
  else:items[last]['content']+=schema_prompt(schema)
 messages=[]
 for item in items:
  factory={'system':ChatMessage.system,'user':ChatMessage.user,'assistant':ChatMessage.assistant}.get(item['role'])
  if factory is None:raise ValueError('Rol no permitido')
  message=factory().with_text(item['content'])
  if item['role']=='system':message=message.with_reasoning_effort(ReasoningEffort.Disabled)
  messages.append(message)
 # uzu 0.6.3 exige ContextLength; un int lanza TypeError antes de cargar pesos.
 session=await engine.chat(model,ChatConfig.create().with_context_length(ContextLength.Custom(4096)))
 reply_config=ChatReplyConfig.create().with_token_limit(min(1200,int(payload.get('options',{}).get('num_predict',900))))
 if schema:reply_config=reply_config.with_grammar(Grammar.JsonSchema(json.dumps(schema)))
 replies=await session.reply(messages,reply_config)
 if not replies or not replies[-1].message.text:raise RuntimeError('Uzu devolvió una respuesta vacía')
 text=replies[-1].message.text
 if schema:text=coerce_json(text,schema)
 print(json.dumps({'message':{'role':'assistant','content':text}},ensure_ascii=False))

if __name__=='__main__':
 for key in ('MIRAI_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY','XAI_API_KEY','BASETEN_API_KEY','OPENROUTER_API_KEY'):
  os.environ.pop(key,None)
 asyncio.run(asyncio.wait_for(main(),timeout=1800 if "--download" in sys.argv else 115))
