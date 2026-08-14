"""
ONNX export + int8 quantisation of unilux/whisper-base-v1-luxembourgish,
to answer one question: could it run in the browser?

Answer: no, on payload size. Kept so the number is reproducible.

    optimum-cli export onnx \
      --model unilux/whisper-base-v1-luxembourgish \
      --task automatic-speech-recognition-with-past \
      --opset 14 /tmp/onnx-base

then this script. Note `decoder_model_merged.onnx` barely shrinks under
dynamic quantisation (315 MB -> 314.8 MB): its weights sit inside `If`
subgraphs, which quantize_dynamic skips. The unmerged pair quantises
properly, at the cost of shipping two decoders.
"""
from onnxruntime.quantization import quantize_dynamic, QuantType
import os, shutil

src, dst = '/tmp/onnx-base', '/tmp/onnx-base-q'
os.makedirs(f'{dst}/onnx', exist_ok=True)
for f in os.listdir(src):
    if not f.endswith('.onnx'):
        shutil.copy(f'{src}/{f}', f'{dst}/{f}')

for name in ['encoder_model', 'decoder_model', 'decoder_with_past_model']:
    a = f'{src}/{name}.onnx'
    b = f'{dst}/onnx/{name}_quantized.onnx'
    quantize_dynamic(a, b, weight_type=QuantType.QInt8)
    print(f'{name}: {os.path.getsize(a)/1e6:.0f} MB -> {os.path.getsize(b)/1e6:.1f} MB')
