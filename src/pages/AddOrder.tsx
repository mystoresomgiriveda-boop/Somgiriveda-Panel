import { useState, useRef, useEffect } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'react-hot-toast';
import { Camera, Scan, Sparkles, Zap, RotateCcw, Save, X, Loader2, DollarSign, User, Package, MessageSquare, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { playBeep, cn, handleFirestoreError, OperationType } from '../lib/utils';

// Helper to extract data from text using common patterns
function extractOrderData(text: string) {
  // Common patterns for Order IDs: alphanumeric 8-12 chars, or starting with letters
  const orderIdMatch = text.match(/[A-Z0-9-]{6,15}/) || text.match(/Order\s*ID:?\s*([A-Z0-9-]+)/i);
  const amountMatch = text.match(/Total:?\s*(?:₹|Rs\.?)?\s*(\d+(?:\.\d{2})?)/i) || text.match(/(?:₹|Rs\.?)?\s*(\d+(?:\.\d{2})?)/);
  
  // Name is hardest - look for "To:" or "Customer:" or common names (highly variable)
  // For this app we'll just try to pick first multiline string that isn't a status if we can't find marker
  const nameMatch = text.match(/(?:Name|Customer|To):?\s*([a-zA-Z\s]{3,30})/i);

  return {
    orderId: orderIdMatch ? (Array.isArray(orderIdMatch) ? orderIdMatch[1] || orderIdMatch[0] : orderIdMatch[0]) : '',
    amount: amountMatch ? amountMatch[1] : '',
    customerName: nameMatch ? nameMatch[1].trim() : ''
  };
}

export default function AddOrder() {
  const [showScanner, setShowScanner] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  
  const [formData, setFormData] = useState({
    orderId: '',
    customerName: '',
    amount: '',
    courierName: 'Delhivery',
    status: 'pending',
    date: new Date().toISOString().split('T')[0]
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      const constraints: MediaStreamConstraints = {
        video: { 
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;

        // Try to enable continuous focus if supported
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities() as any;
        if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
          await (track as any).applyConstraints({
            advanced: [{ focusMode: 'continuous' }]
          });
        }
      }
    } catch (err: any) {
      console.error("Camera error:", err);
      try {
          // Absolute fallback if ideal environment fails
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            streamRef.current = fallbackStream;
          }
      } catch (innerErr) {
          toast.error("Camera not accessible. Please ensure permissions are granted and camera is available.");
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const toggleFlashlight = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    try {
      await (track as any).applyConstraints({
        advanced: [{ torch: !torchOn }]
      });
      setTorchOn(!torchOn);
    } catch (e) {
      toast.error("Flashlight not supported on this device");
    }
  };

  const handleScan = async () => {
    if (!videoRef.current || !canvasRef.current || isScanning) return;
    
    setIsScanning(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);

      try {
        const response = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64 })
        });

        if (!response.ok) throw new Error('Extraction failed');
        
        const extracted = await response.json();
        
        if (extracted.orderId || extracted.amount || extracted.customerName) {
          setFormData(prev => ({
            ...prev,
            orderId: extracted.orderId || prev.orderId,
            amount: extracted.amount || prev.amount,
            customerName: extracted.customerName || prev.customerName,
            courierName: extracted.courierName || prev.courierName
          }));
          playBeep();
          toast.success("AI extraction complete!");
          setShowScanner(false);
          stopCamera();
        } else {
          toast.error("AI could not find details. Try highlighting the text better.");
        }
      } catch (err) {
        console.error("AI Error:", err);
        toast.error("AI Processing Failed");
      }
    }
    setIsScanning(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.orderId || !formData.customerName || !formData.amount) {
      toast.error("Please fill all required fields");
      return;
    }

    const path = 'orders';
    try {
      await addDoc(collection(db, path), {
        ...formData,
        amount: parseFloat(formData.amount),
        createdAt: serverTimestamp(),
      });
      toast.success("Order added successfully!");
      setFormData({
        orderId: '',
        customerName: '',
        amount: '',
        courierName: 'Delhivery',
        status: 'pending',
        date: new Date().toISOString().split('T')[0]
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">New Order</h1>
          <p className="text-slate-500 text-sm">Fill manually or use the scanner.</p>
        </div>
        <button 
          onClick={() => { setShowScanner(true); startCamera(); }}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all"
        >
          <Camera size={20} />
          Scan Label
        </button>
      </div>

      <motion.div 
        layout
        className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-xl"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
                <label className="text-xs font-black uppercase text-slate-400 ml-1">Order ID</label>
                <div className="relative">
                  <Package className="absolute left-4 top-3.5 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    value={formData.orderId}
                    onChange={e => setFormData({...formData, orderId: e.target.value})}
                    className="w-full bg-slate-50 border border-transparent focus:border-blue-500 focus:bg-white p-3.5 pl-12 rounded-2xl outline-none transition-all" 
                    placeholder="ORD-7821" 
                  />
                </div>
             </div>
             <div className="space-y-2">
                <label className="text-xs font-black uppercase text-slate-400 ml-1">Date</label>
                <div className="relative">
                  <input 
                    type="date" 
                    value={formData.date}
                    onFocus={(e) => e.target.showPicker()}
                    onChange={e => setFormData({...formData, date: e.target.value})}
                    className="w-full bg-slate-50 border border-transparent focus:border-blue-500 focus:bg-white p-3.5 rounded-2xl outline-none transition-all text-xs font-bold" 
                  />
                </div>
             </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black uppercase text-slate-400 ml-1">Customer Name</label>
            <div className="relative">
              <User className="absolute left-4 top-3.5 text-slate-400" size={18} />
              <input 
                type="text" 
                value={formData.customerName}
                onChange={e => setFormData({...formData, customerName: e.target.value})}
                className="w-full bg-slate-50 border border-transparent focus:border-blue-500 focus:bg-white p-3.5 pl-12 rounded-2xl outline-none transition-all" 
                placeholder="Rohit Sharma" 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
                <label className="text-xs font-black uppercase text-slate-400 ml-1">Amount (₹)</label>
                <div className="relative">
                  <DollarSign className="absolute left-4 top-3.5 text-slate-400" size={18} />
                  <input 
                    type="number" 
                    value={formData.amount}
                    onChange={e => setFormData({...formData, amount: e.target.value})}
                    className="w-full bg-slate-50 border border-transparent focus:border-blue-500 focus:bg-white p-3.5 pl-12 rounded-2xl outline-none transition-all" 
                    placeholder="1299" 
                  />
                </div>
             </div>
             <div className="space-y-2">
                <label className="text-xs font-black uppercase text-slate-400 ml-1">Status</label>
                <select 
                   value={formData.status}
                   onChange={e => setFormData({...formData, status: e.target.value})}
                   className="w-full bg-slate-50 border border-transparent focus:border-blue-500 focus:bg-white p-3.5 rounded-2xl outline-none transition-all font-bold text-sm"
                >
                  <option value="pending">Pending</option>
                  <option value="delivered">Delivered</option>
                  <option value="rto_success">RTO Success</option>
                </select>
             </div>
          </div>

          <hr className="border-slate-50" />

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-slate-400 ml-1">Courier Service</label>
              <div className="relative">
                <div className="absolute left-4 top-3.5 text-slate-400">
                  <Package size={18} />
                </div>
                <input 
                    type="text" 
                    value={formData.courierName}
                    onChange={e => setFormData({...formData, courierName: e.target.value})}
                    className="w-full bg-slate-50 border border-transparent focus:border-blue-500 focus:bg-white p-3.5 pl-12 rounded-2xl outline-none transition-all font-bold text-sm"
                    placeholder="Courier Company (AI will auto-fill)"
                />
              </div>
              <p className="text-[10px] text-slate-400 ml-2 italic">Automatically detected during scan.</p>
            </div>
          </div>

          <button 
            type="submit"
            className="w-full bg-slate-900 text-white p-5 rounded-2xl font-black flex items-center justify-center gap-3 shadow-xl hover:bg-slate-800 transition-all active:scale-95"
          >
            <Save size={20} />
            Save Order Details
          </button>
        </form>
      </motion.div>

      {/* OCR Scanner Overlay */}
      <AnimatePresence>
        {showScanner && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-slate-950 flex flex-col items-center justify-center p-4"
          >
            <div className="relative w-full max-w-sm aspect-[3/4] rounded-3xl overflow-hidden border-2 border-slate-800">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover"
              />
              
              {/* Scan Frame Overlay */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] h-64 border-2 border-white/60 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]">
                   <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-blue-500 rounded-tl-xl" />
                   <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-blue-500 rounded-tr-xl" />
                   <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-blue-500 rounded-bl-xl" />
                   <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-blue-500 rounded-br-xl" />
                   
                   <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 animate-scan shadow-[0_0_15px_#3b82f6]" />
                </div>
              </div>

              <div className="absolute top-4 left-0 right-0 flex justify-between px-6 pointer-events-auto">
                <button 
                  onClick={() => { stopCamera(); setShowScanner(false); }}
                  className="w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white"
                >
                  <X size={20} />
                </button>
                <div className="bg-black/40 backdrop-blur-md px-4 py-1.5 rounded-full flex items-center gap-2">
                   <Sparkles size={14} className="text-blue-400" />
                   <span className="text-[10px] font-black text-white uppercase tracking-widest">AI Scanner</span>
                </div>
                <button 
                   onClick={toggleFlashlight}
                   className={cn(
                     "w-10 h-10 backdrop-blur-md rounded-full flex items-center justify-center transition-colors",
                     torchOn ? "bg-amber-500 text-white" : "bg-black/40 text-white"
                   )}
                >
                  <Zap size={20} />
                </button>
              </div>

              {isScanning && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white space-y-4">
                   <div className="w-12 h-12 border-4 border-white/20 border-t-blue-500 rounded-full animate-spin" />
                   <p className="text-sm font-black uppercase tracking-widest animate-pulse">Processing Label...</p>
                </div>
              )}
            </div>

            <div className="mt-10 flex flex-col items-center gap-6 w-full max-w-sm">
               <button 
                  onClick={handleScan}
                  disabled={isScanning}
                  className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-transform group"
               >
                  <div className="w-16 h-16 rounded-full border-4 border-slate-900 flex items-center justify-center group-hover:bg-slate-50 transition-colors">
                    <Scan size={32} className="text-slate-900" />
                  </div>
               </button>
               <p className="text-slate-500 text-xs text-center px-10">Position the labels order ID and customer info within the box and tap to scan.</p>
               
               <button 
                 onClick={() => { setShowScanner(false); stopCamera(); }}
                 className="text-slate-400 text-sm font-bold uppercase tracking-widest hover:text-white transition-colors"
               >
                  Cancel & Enter Manually
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
