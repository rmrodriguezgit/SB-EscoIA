# Uzu local en EscoIA

Repositorio solicitado: https://github.com/rmrodriguezgit/uzu, commit d76d468a1898cacc9c4920accf8f5ff099967107. El README remite a https://github.com/trymirai/uzu. Licencia MIT. Runtime instalado: rueda Python ARM64 `uzu==0.6.3`, Python 3.12, macOS mínimo 26. Este equipo utiliza macOS 27.

## Preparación y elección

Desde la carpeta `second-brain`:

```bash
./scripts/preparar-uzu.sh
./arrancar-escoia.sh
```

Si EscoIA ya está ejecutándose, detén su terminal con Ctrl+C y arráncalo de nuevo para cargar el nuevo backend. En Estado del sistema elige Local · Qwen + LAYA y después Uzu · Qwen3.5 0.8B. Remoto sigue siendo el predeterminado. Los modelos Ollama 1.5B y 3B permanecen disponibles. La recuperación de una caída remota utiliza el modelo local seleccionado.

El instalador debe finalizar con `downloaded`; un error no crea la marca de disponibilidad. Uzu utiliza su formato Mirai, no abre directamente los modelos de Ollama. Modelo seleccionado del ejemplo oficial: `alibaba:qwen3.5:0.8b:mirai:mirai-m:4`. Un modelo más pequeño puede tener menor calidad; no implica equivalencia con Qwen remoto 7B.

## Recursos y seguridad

Una generación local activa, contexto de 4096, hasta 1200 tokens de salida y máximo 120 segundos. Cada petición ejecuta un proceso aislado que termina y libera sus pesos antes de LAYA. La reserva inicial conservadora es 1,5 GiB y se mantienen las comprobaciones de presión de memoria. Uzu acelera inferencia con Metal; no amplía la RAM física ni garantiza eliminar swap.

Pesos y registro: `~/.cache/mirai` (ruta impuesta por Uzu). El descargador Universal evita el fallo del descargador nativo observado en este entorno. No se configuran proveedores de nube en el proceso Uzu. Descarga inicial requiere internet; conversaciones posteriores emplean el modelo local. LAYA conserva su runtime dedicado.

## Validación

Importación de Uzu ARM64 verificada. Compilación React y 93 pruebas Python pasan (3 omitidas), incluyendo contrato del adaptador, liberación del bloqueo al agotar tiempo, reserva y rechazo de selección sin pesos. Estas pruebas no son un benchmark de generación ni de calidad. El entorno restringido impide leer el indicador sysctl de presión; no se elude la protección de memoria para probar pesos. La prueba real de generación y latencia queda pendiente hasta disponer de margen y telemetría.

Para probar generación sin eludir el presupuesto:

```bash
PYTHONPATH=src .venv/bin/python scripts/probar-uzu.py
```

Registra tiempo total (incluye carga fría) y comprueba JSON no vacío. No mide primer token ni garantiza calidad académica. Si falla la telemetría o el margen, detén la prueba y ejecútala fuera de Codex cuando haya recursos disponibles.

Actualización 2026-10-12: descarga completada y estado `Downloaded` comprobado. El adaptador informa el modelo disponible. La prueba protegida de generación se detuvo antes de cargar pesos porque `kern.memorystatus_vm_pressure_level` devuelve Operation not permitted en este entorno. No se ha medido aceleración ni calidad.
