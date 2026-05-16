import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Search, Download, CheckCircle2, RotateCcw, Clock, Trash2, Hash } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'react-hot-toast';
import { cn, handleFirestoreError, OperationType } from '../lib/utils';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

interface Order {
  id: string;
  orderId: string;
  customerName: string;
  amount: number;
  status: string;
  courierName: string;
  trackingId: string;
  date: string;
  createdAt: { toDate: () => Date } | null;
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showActiveRow, setShowActiveRow] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    const path = 'orders';
    const q = query(collection(db, path), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Order[];
      setOrders(ordersData);
      setLoading(false);
    }, (error: unknown) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return () => unsubscribe();
  }, []);

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
      order.orderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.trackingId?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    const path = `orders/${orderId}`;
    try {
      await updateDoc(doc(db, 'orders', orderId), { status: newStatus });
      toast.success(`Marked as ${newStatus}`);
      setShowActiveRow(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const handleDelete = async (orderId: string) => {
    if (!confirm('Are you sure you want to delete this order?')) return;
    const path = `orders/${orderId}`;
    try {
      await deleteDoc(doc(db, 'orders', orderId));
      toast.success('Order deleted');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const exportData = () => {
    const dataToExport = filteredOrders.map(o => ({
      'Order ID': o.orderId,
      'Customer': o.customerName,
      'Amount': o.amount,
      'Status': o.status,
      'Courier': o.courierName,
      'Date': o.date
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orders");
    XLSX.writeFile(wb, `Orders_Export_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success("Excel exported successfully");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Orders Registry</h1>
          <p className="text-slate-500 text-sm">{filteredOrders.length} records found in system.</p>
        </div>
        <button 
          onClick={exportData}
          className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
        >
          <Download size={18} />
          Export Records
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row gap-4 bg-white p-2 rounded-[1.5rem] border border-slate-100 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search by ID, Customer or Tracking..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-xl text-sm outline-none focus:ring-2 ring-blue-500/10 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 p-1">
          {['all', 'pending', 'delivered', 'rto_success'].map(s => (
            <button
               key={s}
               onClick={() => setStatusFilter(s)}
               className={cn(
                 "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                 statusFilter === s ? "bg-slate-900 text-white shadow-lg" : "text-slate-400 hover:bg-slate-50"
               )}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Responsive Cards / List */}
      <div className="grid gap-4">
        <AnimatePresence mode="popLayout">
          {filteredOrders.map((order) => (
            <motion.div
              layout
              key={order.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn(
                "group bg-white border border-slate-100 p-4 sm:p-6 rounded-[1.8rem] shadow-sm hover:shadow-xl transition-all duration-300 relative",
                showActiveRow === order.id && "ring-2 ring-blue-500 shadow-xl"
              )}
            >
               <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center font-black text-slate-400">
                      {order.customerName.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">{order.customerName}</h3>
                      <p className="text-xs text-slate-400 font-medium">Placed on {format(new Date(order.date), 'MMM dd, h:mm a')}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-1",
                      order.status === 'delivered' ? "bg-emerald-100 text-emerald-700" :
                      order.status === 'pending' ? "bg-amber-100 text-amber-700" :
                      "bg-rose-100 text-rose-700"
                    )}>
                      {order.status.replace('_', ' ')}
                    </span>
                    <p className="text-xl font-black text-slate-900">₹{order.amount}</p>
                  </div>
               </div>

                <div className="grid grid-cols-3 gap-4 py-4 border-y border-slate-50 my-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-slate-400 flex items-center gap-1"><Hash size={12} /> ID</span>
                    <p className="font-bold font-mono tracking-tighter text-slate-900">{order.orderId}</p>
                  </div>
                  <div className="space-y-1 text-center">
                    <span className="text-slate-400">State</span>
                    <p className="font-bold text-slate-900 truncate">{order.state || 'N/A'}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <span className="text-slate-400">Courier</span>
                    <p className="font-bold text-slate-900">{order.courierName}</p>
                  </div>
               </div>

               <div className="flex items-center justify-between mt-auto">
                 <div className="flex gap-2">
                    <button 
                      onClick={() => handleUpdateStatus(order.id, 'delivered')}
                      disabled={order.status === 'delivered'}
                      className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors disabled:opacity-30"
                      title="Deliver"
                    >
                      <CheckCircle2 size={18} />
                    </button>
                    <button 
                      onClick={() => handleUpdateStatus(order.id, 'rto_success')}
                      disabled={order.status === 'rto_success'}
                      className="p-2.5 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors disabled:opacity-30"
                      title="RTO Success"
                    >
                      <RotateCcw size={18} />
                    </button>
                    <button 
                      onClick={() => handleUpdateStatus(order.id, 'pending')}
                      disabled={order.status === 'pending'}
                      className="p-2.5 rounded-xl bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors disabled:opacity-30"
                      title="Set Pending"
                    >
                      <Clock size={18} />
                    </button>
                 </div>

                 <div className="flex items-center gap-2">
                    <button 
                       onClick={() => handleDelete(order.id)}
                       className="p-2.5 rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                 </div>
               </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {loading && (
          <div className="grid gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-40 bg-white rounded-[2rem] animate-pulse border border-slate-100" />
            ))}
          </div>
        )}

        {!loading && filteredOrders.length === 0 && (
          <div className="bg-white border-2 border-dashed border-slate-100 rounded-[2rem] p-20 flex flex-col items-center justify-center text-center">
             <div className="w-16 h-16 bg-slate-50 flex items-center justify-center rounded-2xl mb-4">
                <Search className="text-slate-300" size={32} />
             </div>
             <h3 className="text-xl font-bold text-slate-800">No records found</h3>
             <p className="text-slate-400 text-sm max-w-xs mt-2">Adjust your filters or try a different search term to find what you're looking for.</p>
          </div>
        )}
      </div>
    </div>
  );
}
