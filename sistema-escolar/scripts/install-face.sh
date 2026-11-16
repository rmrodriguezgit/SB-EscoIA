#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p models
curl -fL --retry 3 https://huggingface.co/opencv/face_detection_yunet/resolve/main/face_detection_yunet_2023mar.onnx -o models/face_detection_yunet_2023mar.onnx
if [[ "${ACCEPT_INSIGHTFACE_RESEARCH_LICENSE:-}" == 'yes' ]]; then
  curl -fL --retry 3 https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_sc.zip -o models/buffalo_sc.zip
  unzip -jo models/buffalo_sc.zip w600k_mbf.onnx -d models
else
  echo 'ArcFace: coloca un modelo ONNX 512-d autorizado en models/w600k_mbf.onnx.'
  echo 'Los pesos InsightFace tienen condiciones de uso para investigación; revisa INSTALACION.md.'
fi
cmake -S native -B build -DCMAKE_BUILD_TYPE=Release -DWITH_FACE=ON -DOpenCV_DIR="$(brew --prefix opencv)/lib/cmake/opencv4"
cmake --build build -j 2
