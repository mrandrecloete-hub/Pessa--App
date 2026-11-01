# Architecture copied from Real-ESRGAN (BSD-3-Clause, Xintao Wang): realesrgan/archs/srvgg_arch.py
import sys, torch, torch.nn as nn, torch.nn.functional as F, numpy as np, onnxruntime as ort
class SRVGGNetCompact(nn.Module):
    def __init__(self, num_in_ch=3, num_out_ch=3, num_feat=64, num_conv=32, upscale=4):
        super().__init__()
        self.upscale = upscale
        self.body = nn.ModuleList([nn.Conv2d(num_in_ch, num_feat, 3, 1, 1), nn.PReLU(num_parameters=num_feat)])
        for _ in range(num_conv):
            self.body.append(nn.Conv2d(num_feat, num_feat, 3, 1, 1)); self.body.append(nn.PReLU(num_parameters=num_feat))
        self.body.append(nn.Conv2d(num_feat, num_out_ch * upscale * upscale, 3, 1, 1))
        self.upsampler = nn.PixelShuffle(upscale)
    def forward(self, x):
        out = x
        for m in self.body: out = m(out)
        out = self.upsampler(out)
        return out + F.interpolate(x, scale_factor=self.upscale, mode='nearest')
src, dst = sys.argv[1], sys.argv[2]
sd = torch.load(src, map_location="cpu", weights_only=True)
key = "params_ema" if "params_ema" in sd else "params"
m = SRVGGNetCompact(); m.load_state_dict(sd[key]); m.eval()
x = torch.rand(1, 3, 64, 64)
torch.onnx.export(m, x, dst, input_names=["input"], output_names=["output"], opset_version=17,
    dynamic_axes={"input": {2: "h", 3: "w"}, "output": {2: "h4", 3: "w4"}}, dynamo=False)
with torch.no_grad():
    for h, w in [(64, 64), (48, 80)]:
        t = torch.rand(1, 3, h, w); ref = m(t).numpy()
        out = ort.InferenceSession(dst).run(None, {"input": t.numpy()})[0]
        print("key", key, "shape", out.shape, "max abs diff vs torch", float(np.abs(out - ref).max()))
