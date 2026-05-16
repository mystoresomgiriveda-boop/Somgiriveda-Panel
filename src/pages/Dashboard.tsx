import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { ShoppingBag, Clock, CheckCircle2, RotateCcw, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { subDays, isAfter, isBefore, startOfDay, isWithinInterval, endOfDay } from 'date-fns';
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
  const [filterDate, setFilterDate] = useState('all'); // all, today, 7days, 30days, overdue, custom
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [showOverdueModal, setShowOverdueModal] = useState(false);
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
    if (filterDate === 'overdue') {
      return order.status === 'pending' && isBefore(orderDate, subDays(new Date(), 15));
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

  const highPriorityOrdersList = orders.filter(o => {
    if (o.status !== 'pending') return false;
    const orderDate = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.date);
    // Logic: Placed MORE than 15 days ago and still pending
    return isBefore(orderDate, subDays(new Date(), 15));
  });

  const statsCount = {
    ...stats,
    highPriority: highPriorityOrdersList.length
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
    { title: 'Total Orders', value: statsCount.total, icon: ShoppingBag, color: 'bg-indigo-500', bg: 'bg-indigo-50' },
    { title: 'Earnings', value: `₹${statsCount.earnings.toLocaleString()}`, icon: ArrowUpRight, color: 'bg-emerald-500', bg: 'bg-emerald-50' },
    { title: 'Pending', value: statsCount.pending, icon: Clock, color: 'bg-amber-500', bg: 'bg-amber-50' },
    { title: 'Red Alert', value: statsCount.highPriority, icon: AlertTriangle, color: 'bg-red-500', bg: 'bg-red-50', highlight: statsCount.highPriority > 0, onClick: () => setShowOverdueModal(true) },
    { title: 'Delivered', value: statsCount.delivered, icon: CheckCircle2, color: 'bg-blue-500', bg: 'bg-blue-50' },
    { title: 'Total Return', value: statsCount.rto, icon: RotateCcw, color: 'bg-rose-500', bg: 'bg-rose-50' },
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
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Dev Somgiriveda</h1>
          <p className="text-slate-500 text-sm">Real-time logistics analytics and monitoring.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 p-1 bg-white border border-slate-200 rounded-xl w-fit">
          {['all', 'today', '7days', '30days', 'overdue', 'custom'].map((d) => (
            <button
              key={d}
              onClick={() => setFilterDate(d)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all capitalize",
                filterDate === d 
                  ? (d === 'overdue' ? "bg-red-600 text-white shadow-lg shadow-red-100" : "bg-slate-900 text-white shadow-lg") 
                  : "text-slate-500 hover:bg-slate-50",
                d === 'overdue' && filterDate !== d && "text-red-500 bg-red-50 hover:bg-red-100"
              )}
            >
              {d === '7days' ? 'Last 7D' : d === '30days' ? 'Last 30D' : d === 'overdue' ? 'Red Alert' : d}
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
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
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

      {/* Featured Alerts / Priority List Preview */}
      {statsCount.highPriority > 0 && (
        <div className="space-y-6">
          <div className="bg-red-50 border border-red-100 rounded-[2rem] p-6 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/5 blur-3xl rounded-full -mr-32 -mt-32" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-red-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-red-200">
                  <AlertTriangle className="text-white" size={24} />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-red-900">Urgent: {statsCount.highPriority} Overdue Orders</h4>
                  <p className="text-red-700/80 text-sm max-w-md">There are {statsCount.highPriority} orders that have been pending for more than 15 days.</p>
                </div>
              </div>
              <button 
                onClick={() => setShowOverdueModal(true)}
                className="px-6 py-3 bg-red-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-red-200 hover:bg-red-700 transition-all hover:scale-105 active:scale-95 flex items-center gap-2 whitespace-nowrap"
              >
                Open Alert Dialog <ArrowUpRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overdue Alert Dialog (Modal) */}
      <AnimatePresence>
        {showOverdueModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowOverdueModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl border-4 border-red-50 overflow-hidden"
            >
              <div className="bg-red-600 p-8 text-white">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center">
                      <AlertTriangle size={24} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black">Overdue Alerts</h3>
                      <p className="text-red-100 text-sm font-medium">Pending for 15+ Days</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowOverdueModal(false)}
                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors font-bold"
                  >
                    ✕
                  </button>
                </div>
              </div>
              
              <div className="p-2 max-h-[60vh] overflow-y-auto">
                <div className="divide-y divide-slate-100">
                  {highPriorityOrdersList.map((order) => (
                    <div key={order.id} className="flex items-center justify-between p-5 hover:bg-red-50/50 transition-colors rounded-2xl">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center font-bold text-red-600 text-sm">
                          {order.customerName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 leading-tight">{order.customerName}</p>
                          <p className="text-xs text-slate-400 font-mono">ID: {order.orderId}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-red-600">₹{order.amount}</p>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('/orders');
                          }}
                          className="text-[10px] text-red-500 font-black uppercase hover:underline"
                        >
                          Resolve →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="p-6 pt-0">
                <button 
                  onClick={() => setShowOverdueModal(false)}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-slate-800 transition-colors"
                >
                  Dismiss Alerts
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
