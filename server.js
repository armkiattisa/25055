import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY || "";
const PIKA_API_KEY = process.env.PIKA_API_KEY || "";
const BASE_URL = process.env.BASE_URL || "";

app.get("/", (_,res)=>res.json({ ok:true, service:"ai-buddy-backend-proxy" }));

// --- OpenAI ---
app.post("/openai/chat", async (req, res) => {
  try{
    const { model="gpt-4o-mini", messages=[], stream=true } = req.body || {};
    const apiKey = req.headers["x-openai-key"] || OPENAI_API_KEY;
    if(!apiKey){ return res.status(200).type("text/plain").end("⚠️ MOCK: no OpenAI key at backend"); }
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+apiKey },
      body: JSON.stringify({ model, messages, stream })
    });
    res.setHeader("Content-Type","text/plain; charset=utf-8");
    r.body.pipe(res);
  }catch(e){ res.status(500).json({ error:String(e) }); }
});

app.post("/openai/image", async (req,res)=>{
  try{
    const { model="gpt-image-1", prompt="", size="1024x1024" } = req.body || {};
    const apiKey = req.headers["x-openai-key"] || OPENAI_API_KEY;
    if(!apiKey){ return res.json({ ok:true, url: null, mock: true, note:"no key" }); }
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method:"POST",
      headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+apiKey },
      body: JSON.stringify({ model, prompt, size })
    });
    const j = await r.json();
    res.json({ ok:true, url: j?.data?.[0]?.url || null, raw:j });
  }catch(e){ res.status(500).json({ error:String(e) }); }
});

// --- Image -> Video (Runway / Pika) ---
const tasks = new Map();
app.post("/api/image-to-video", async (req,res)=>{
  const { image_url=null, prompt="", provider="runway" } = req.body || {};
  try{
    if(provider === "runway"){
      const key = req.headers["x-runway-key"] || RUNWAY_API_KEY;
      if(!key){
        const id="mock_"+Math.random().toString(36).slice(2,8);
        tasks.set(id,{status:"processing",provider:"mock",created:Date.now()});
        return res.json({ ok:true, task_id:id, provider:"mock" });
      }
      const r = await fetch("https://api.runwayml.com/v1/generate/video", {
        method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+key },
        body: JSON.stringify({ prompt, init_image: image_url, duration: 5 })
      });
      const j = await r.json();
      const id = j.id || ("runway_"+Math.random().toString(36).slice(2,8));
      tasks.set(id,{status:"processing",provider:"runway",created:Date.now()});
      return res.json({ ok:true, task_id:id, provider:"runway", raw:j });
    }
    if(provider === "pika"){
      const key = req.headers["x-pika-key"] || PIKA_API_KEY;
      if(!key){
        const id="mock_"+Math.random().toString(36).slice(2,8);
        tasks.set(id,{status:"processing",provider:"mock",created:Date.now()});
        return res.json({ ok:true, task_id:id, provider:"mock" });
      }
      const r = await fetch("https://api.pika.art/v1/video", {
        method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization":"Bearer "+key },
        body: JSON.stringify({ prompt, image_url, duration: 5 })
      });
      const j = await r.json();
      const id = j.id || ("pika_"+Math.random().toString(36).slice(2,8));
      tasks.set(id,{status:"processing",provider:"pika",created:Date.now()});
      return res.json({ ok:true, task_id:id, provider:"pika", raw:j });
    }
    // default mock
    const id="mock_"+Math.random().toString(36).slice(2,8);
    tasks.set(id,{status:"processing",provider:"mock",created:Date.now()});
    res.json({ ok:true, task_id:id, provider:"mock" });
  }catch(e){
    const id="mock_"+Math.random().toString(36).slice(2,8);
    tasks.set(id,{status:"processing",provider:"mock",created:Date.now(),error:String(e)});
    res.json({ ok:true, task_id:id, provider:"mock", note:"provider error; mocked" });
  }
});

app.get("/api/task/:id", async (req,res)=>{
  const { id } = req.params;
  const t = tasks.get(id);
  if(!t) return res.json({ status:"not_found" });
  if(Date.now() - t.created > 3000){
    t.status="succeeded";
    t.output=[{ url: BASE_URL ? (BASE_URL + "/static/sample.mp4") : "https://samplelib.com/lib/preview/mp4/sample-5s.mp4" }];
  }
  res.json(t);
});

app.use("/static", express.static("static"));

app.listen(PORT, ()=>console.log("Backend proxy on http://localhost:"+PORT));