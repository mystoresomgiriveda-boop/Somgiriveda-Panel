import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { ShoppingBag, Clock, CheckCircle2, RotateCcw, ArrowUpRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { subDays, isAfter, startOfDay, isWithinInterval, endOfDay } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { cn, handleFirestoreError, OperationType } from '../lib/utils';

interface Order {
  id: string;
  orderId: string;
  customerName: string;
  amount: number;
  status: string;
  date: string;
  createdAt: { toDate: () => Date } | null;
  state?: string;
}

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState('all'); // all, today, 7days, 30days, custom
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const navigate = useNavigate();

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
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, []);

  const filteredOrders = orders.filter(order => {
    if (filterDate === 'all') return true;
    
    // Firestore timestamps are usually objects with seconds
    const orderDate = order.createdAt?.toDate ? order.createdAt.toDate() : new Date(order.date);
    
    if (filterDate === 'today') {
      return isAfter(orderDate, startOfDay(new Date()));
    }
    if (filterDate === '7days') {
      return isAfter(orderDate, subDays(new Date(), 7));
    }
    if (filterDate === '30days') {
      return isAfter(orderDate, subDays(new Date(), 30));
    }
    if (filterDate === 'custom' && dateRange.start && dateRange.end) {
      return isWithinInterval(orderDate, {
        start: startOfDay(new Date(dateRange.start)),
        end: endOfDay(new Date(dateRange.end))
      });
    }
    return true;
  });

  const stats = {
    total: filteredOrders.length,
    pending: filteredOrders.filter(o => o.status === 'pending').length,
    delivered: filteredOrders.filter(o => o.status === 'delivered').length,
    rto: filteredOrders.filter(o => o.status === 'rto_success').length,
    earnings: filteredOrders
      .filter(o => o.status === 'delivered')
      .reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0),
  };

  // Find courier with most RTO
  const rtoByCourier: Record<string, number> = {};
  const deliveryByCourier: Record<string, number> = {};

  filteredOrders.forEach(o => {
    // @ts-expect-error - courierName is present in Order data but not in interface
    const courier = (o as { courierName?: string }).courierName || 'Unknown';
    if (o.status === 'rto_success') {
      rtoByCourier[courier] = (rtoByCourier[courier] || 0) + 1;
    } else if (o.status === 'delivered') {
      deliveryByCourier[courier] = (deliveryByCourier[courier] || 0) + 1;
    }
  });
  
  const topRtoCourier = Object.entries(rtoByCourier).sort((a,b) => b[1] - a[1])[0]?.[0] || 'None';
  const topDeliveryCourier = Object.entries(deliveryByCourier).sort((a,b) => b[1] - a[1])[0]?.[0] || 'None';

  // State analytics
  const deliveriesByState: Record<string, number> = {};
  const rtoByState: Record<string, number> = {};
  
  filteredOrders.forEach(o => {
    const s = o.state || 'Unknown';
    if (o.status === 'delivered') {
      deliveriesByState[s] = (deliveriesByState[s] || 0) + 1;
    } else if (o.status === 'rto_success') {
      rtoByState[s] = (rtoByState[s] || 0) + 1;
    }
  });

  const highDeliveriesState = Object.entries(deliveriesByState).sort((a,b) => b[1] - a[1])[0]?.[0] || 'None';
  const highRtoState = Object.entries(rtoByState).sort((a,b) => b[1] - a[1])[0]?.[0] || 'None';

  const statCards = [
    { title: 'Total Orders', value: stats.total, icon: ShoppingBag, color: 'bg-indigo-500', bg: 'bg-indigo-50' },
    { title: 'Earnings', value: `₹${stats.earnings.toLocaleString()}`, icon: ArrowUpRight, color: 'bg-emerald-500', bg: 'bg-emerald-50' },
    { title: 'Pending', value: stats.pending, icon: Clock, color: 'bg-amber-500', bg: 'bg-amber-50' },
    { title: 'Delivered', value: stats.delivered, icon: CheckCircle2, color: 'bg-blue-500', bg: 'bg-blue-50' },
    { title: 'Total Return', value: stats.rto, icon: RotateCcw, color: 'bg-rose-500', bg: 'bg-rose-50' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="relative">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Overview</h1>
          <p className="text-slate-500 text-sm">Real-time logistics analytics and monitoring.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 p-1 bg-white border border-slate-200 rounded-xl w-fit">
          {['all', 'today', '7days', '30days', 'custom'].map((d) => (
            <button
              key={d}
              onClick={() => setFilterDate(d)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all capitalize",
                filterDate === d 
                  ? "bg-slate-900 text-white shadow-lg" 
                  : "text-slate-500 hover:bg-slate-50"
              )}
            >
              {d === '7days' ? 'Last 7D' : d === '30days' ? 'Last 30D' : d}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {filterDate === 'custom' && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white border border-slate-100 rounded-[1.5rem] p-4 flex flex-wrap items-center gap-4 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">From</span>
                <input 
                  type="date" 
                  value={dateRange.start}
                  onChange={e => setDateRange({...dateRange, start: e.target.value})}
                  className="bg-slate-50 border-none rounded-lg p-2 text-xs font-bold outline-none ring-1 ring-slate-200 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">To</span>
                <input 
                  type="date" 
                  value={dateRange.end}
                  onChange={e => setDateRange({...dateRange, end: e.target.value})}
                  className="bg-slate-50 border-none rounded-lg p-2 text-xs font-bold outline-none ring-1 ring-slate-200 focus:ring-blue-500"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stat Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            onClick={stat.onClick}
            className={cn(
              "p-5 rounded-[2rem] bg-white border border-slate-100 flex flex-col justify-between min-h-[140px] shadow-sm relative overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition-all duration-300",
              stat.highlight ? "ring-2 ring-red-500 border-red-100 cursor-pointer" : "",
              stat.onClick ? "cursor-pointer" : ""
            )}
          >
            <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110", stat.bg)}>
              <stat.icon className={stat.color.replace('bg-', 'text-')} size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 mb-1 uppercase tracking-wider">{stat.title}</p>
              <h3 className="text-3xl font-black text-slate-900">{stat.value}</h3>
            </div>
            {stat.highlight && (
              <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-[10px] font-black uppercase tracking-tighter animate-pulse">
                Action Required
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Simple Table Preview or Charts could go here */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-[2rem] border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-black text-slate-900">Recent Activity</h3>
            <button onClick={() => navigate('/orders')} className="text-blue-600 text-xs font-bold hover:underline">See all orders</button>
          </div>
          <div className="space-y-4">
            {filteredOrders.slice(0, 5).map((order) => (
              <div key={order.id} className="flex items-center justify-between p-4 hover:bg-slate-50 border border-transparent hover:border-slate-100 rounded-2xl transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-400 text-xs">
                    {order.customerName.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{order.customerName}</p>
                    <p className="text-xs text-slate-400 font-mono tracking-tighter">ID: {order.orderId}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-black text-slate-900 text-sm">₹{order.amount}</p>
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md",
                    order.status === 'delivered' ? "bg-emerald-100 text-emerald-700" :
                    order.status === 'pending' ? "bg-amber-100 text-amber-700" :
                    "bg-rose-100 text-rose-700"
                  )}>
                    {order.status}
                  </span>
                </div>
              </div>
            ))}
            {filteredOrders.length === 0 && (
              <div className="text-center py-10">
                <p className="text-slate-400 text-sm italic">No orders found for this period.</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-slate-900 text-white rounded-[2rem] p-8 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute bottom-0 right-0 w-48 h-48 bg-blue-600/20 blur-[80px] rounded-full translate-x-10 translate-y-10" />
          <div className="relative z-10">
            <h3 className="text-2xl font-black mb-2 leading-tight">Courier & State <br />Analysis.</h3>
            <div className="space-y-3 mb-8 text-sm">
              <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl">
                <span className="text-slate-400">Top Delivery Courier</span>
                <span className="text-blue-400 font-bold">{topDeliveryCourier}</span>
              </div>
              <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl">
                <span className="text-slate-400">High Deliveries State</span>
                <span className="text-emerald-400 font-bold">{highDeliveriesState}</span>
              </div>
              <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl">
                <span className="text-slate-400">High RTO State</span>
                <span className="text-rose-400 font-bold">{highRtoState}</span>
              </div>
              <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl">
                <span className="text-slate-400">Top RTO Courier</span>
                <span className="text-amber-400 font-bold">{topRtoCourier}</span>
              </div>
            </div>
          </div>
          <button 
             onClick={() => navigate('/add-order')}
             className="relative z-10 w-full py-4 bg-white text-slate-900 rounded-2xl font-black text-sm hover:scale-[1.02] transition-transform active:scale-95"
          >
            Launch Scanner
          </button>
        </div>
      </div>
    </div>

  );
}
