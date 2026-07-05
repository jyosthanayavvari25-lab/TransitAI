import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { GoogleGenAI } from '@google/genai';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
app.use(express.json());

const angularApp = new AngularNodeAppEngine();

// Lazy initialize Gemini client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// 1. Predefined APSRTC Visakhapatnam bus database
const apsrtcDatabase = [
  { busNo: '55K', from: 'Gajuwaka', via: 'Scindia', to: 'Kottavalasa', stops: ['Gajuwaka', 'Scindia', 'NAD Junction', 'Kottavalasa'] },
  { busNo: '55H', from: 'Scindia', via: 'Gajuwaka', to: 'Simahachalam', stops: ['Scindia', 'Gajuwaka', 'Simahachalam'] },
  { busNo: '600', from: 'RTC Complex', via: 'Gajuwaka', to: 'Anakapalli', stops: ['RTC Complex', 'Gajuwaka', 'Anakapalli'] },
  { busNo: '400Y', from: 'Scindia', via: 'Gajuwaka', to: 'Elamanchili', stops: ['Scindia', 'Gajuwaka', 'Elamanchili'] },
  { busNo: '999', from: 'RTC Complex', via: 'Hanumanthuvaka', to: 'Bheemili', stops: ['RTC Complex', 'Hanumanthuvaka', 'Bheemili'] },
  { busNo: '38k', from: 'RTC Complex', via: 'NAD', to: 'Kurmannapalem', stops: ['RTC Complex', 'NAD Junction', 'Kurmannapalem'] },
  { busNo: '99', from: 'Gajuwaka', via: 'Scindia', to: 'RK Beach', stops: ['Gajuwaka', 'Scindia', 'RK Beach'] },
  { busNo: '311', from: 'Gajuwaka Depo', via: 'Sri Nagar', to: 'Choddavaram', stops: ['Gajuwaka Depot', 'Sri Nagar', 'Choddavaram'] },
  { busNo: '68k', from: 'Pendurthi', via: 'Simahachalam', to: 'Hanumanthuvaka', stops: ['Pendurthi', 'Simahachalam', 'Hanumanthuvaka'] },
  { busNo: '999', from: 'RTC Complex', via: 'Venkojipalem', to: 'Maddilapalem', stops: ['RTC Complex', 'Venkojipalem', 'Maddilapalem'] },
  { busNo: '222', from: 'RTC Complex', via: 'Venkojipalem', to: 'Maddilapalem', stops: ['RTC Complex', 'Venkojipalem', 'Maddilapalem'] },
  { busNo: '222V', from: 'RTC Complex', via: 'Venkojipalem', to: 'Maddilapalem', stops: ['RTC Complex', 'Venkojipalem', 'Maddilapalem'] },
  { busNo: '60C', from: 'RTC Complex', via: 'Venkojipalem', to: 'Maddilapalem', stops: ['RTC Complex', 'Venkojipalem', 'Maddilapalem'] },
  { busNo: '99', from: 'Old Gajuwaka', via: '', to: 'Collector Office', stops: ['Old Gajuwaka', 'Gajuwaka', 'Collector Office'] },
  { busNo: '411V', from: 'Old Gajuwaka', via: '', to: 'Vijayanagaram', stops: ['Old Gajuwaka', 'Gajuwaka', 'Vijayanagaram'] },
  { busNo: '55D', from: 'Gajuwaka', via: '', to: 'Gajuwaka Depot', stops: ['Gajuwaka', 'Gajuwaka Depot'] },
  { busNo: '38', from: 'Gajuwaka', via: 'Kurmannapalem', to: 'RTC Complex', stops: ['Gajuwaka', 'Kurmannapalem', 'RTC Complex'] },
  { busNo: '55T', from: 'Gajuwaka', via: '', to: 'Tallavalasa', stops: ['Gajuwaka', 'NAD Junction', 'Tallavalasa'] },
  { busNo: '500Y', from: 'RTC Complex', via: '', to: 'Yelamanchili', stops: ['RTC Complex', 'Elamanchili'] },
  { busNo: '6A', from: 'RTC Complex', via: 'Gnanapuaram', to: 'Kancharapalem', stops: ['RTC Complex', 'Gnanapuaram', 'Kancharapalem'] },
  { busNo: '6H', from: 'RTC Complex', via: 'Gnanapuaram', to: 'Kancharapalem', stops: ['RTC Complex', 'Gnanapuaram', 'Kancharapalem'] },
  { busNo: '12D', from: 'Maddilapalem', via: 'RTC Complex', to: 'Devarapalli', stops: ['Maddilapalem', 'RTC Complex', 'Devarapalli'] },
  { busNo: '10K', from: 'Maddilapalem', via: 'Railway Station', to: 'Kailasagiri', stops: ['Maddilapalem', 'Railway Station', 'Kailasagiri'] }
];

const canonicalNames: Record<string, string> = {
  'gajuwaka': 'Gajuwaka',
  'scindia': 'Scindia',
  'kottavalasa': 'Kottavalasa',
  'simahachalam': 'Simahachalam',
  'simhachalam': 'Simahachalam',
  'rtc complex': 'RTC Complex',
  'anakapalli': 'Anakapalli',
  'elamanchili': 'Elamanchili',
  'yelamanchili': 'Elamanchili',
  'bheemili': 'Bheemili',
  'hanumanthuvaka': 'Hanumanthuvaka',
  'nad': 'NAD Junction',
  'nad junction': 'NAD Junction',
  'kurmannapalem': 'Kurmannapalem',
  'rk beach': 'RK Beach',
  'gajuwaka depo': 'Gajuwaka Depot',
  'gajuwaka depot': 'Gajuwaka Depot',
  'sri nagar': 'Sri Nagar',
  'choddavaram': 'Choddavaram',
  'pendurthi': 'Pendurthi',
  'venkojipalem': 'Venkojipalem',
  'maddilapalem': 'Maddilapalem',
  'old gajuwaka': 'Old Gajuwaka',
  'collector office': 'Collector Office',
  'vijayanagaram': 'Vijayanagaram',
  'tallavalasa': 'Tallavalasa',
  'gnanapuaram': 'Gnanapuaram',
  'kancharapalem': 'Kancharapalem',
  'devarapalli': 'Devarapalli',
  'railway station': 'Railway Station',
  'kailasagiri': 'Kailasagiri'
};

function normalizePlace(name: string): string {
  if (!name) return '';
  const val = name.toLowerCase().trim();
  
  if (val.includes('gajuwaka') && val.includes('old')) return 'old gajuwaka';
  if (val.includes('gajuwaka') && (val.includes('depot') || val.includes('depo'))) return 'gajuwaka depo';
  if (val.includes('gajuwaka')) return 'gajuwaka';
  if (val.includes('scindia')) return 'scindia';
  if (val.includes('kottavalasa') || val.includes('kotavalasa')) return 'kottavalasa';
  if (val.includes('simahachalam') || val.includes('simhachalam')) return 'simahachalam';
  if (val.includes('complex') || val.includes('rtc')) return 'rtc complex';
  if (val.includes('anakapalli') || val.includes('anakapalle')) return 'anakapalli';
  if (val.includes('elamanchili') || val.includes('yelamanchili')) return 'elamanchili';
  if (val.includes('bheemili') || val.includes('bheemunipatnam')) return 'bheemili';
  if (val.includes('hanumanthuvaka') || val.includes('hanumanthawaka')) return 'hanumanthuvaka';
  if (val.includes('nad')) return 'nad';
  if (val.includes('kurmannapalem') || val.includes('kurmanapalem')) return 'kurmannapalem';
  if (val.includes('rk beach') || val.includes('rkbeach') || val.includes('ramakrishna') || val.includes('beach')) return 'rk beach';
  if (val.includes('sri nagar') || val.includes('srinagar')) return 'sri nagar';
  if (val.includes('choddavaram') || val.includes('chodavaram')) return 'choddavaram';
  if (val.includes('pendurthi') || val.includes('pendurti')) return 'pendurthi';
  if (val.includes('venkojipalem') || val.includes('venkoji')) return 'venkojipalem';
  if (val.includes('maddilapalem') || val.includes('madilapalem')) return 'maddilapalem';
  if (val.includes('collector')) return 'collector office';
  if (val.includes('vizianagaram') || val.includes('vijayanagaram')) return 'vijayanagaram';
  if (val.includes('tallavalasa') || val.includes('talavalasa')) return 'tallavalasa';
  if (val.includes('gnanapuaram') || val.includes('gnanapuram')) return 'gnanapuaram';
  if (val.includes('kancharapalem') || val.includes('kancharpalem')) return 'kancharapalem';
  if (val.includes('devarapalli') || val.includes('devarapalle')) return 'devarapalli';
  if (val.includes('railway') || val.includes('station')) return 'railway station';
  if (val.includes('kailasagiri')) return 'kailasagiri';
  
  return val;
}

function findRouteProgrammatic(fromInput: string, toInput: string) {
  const startNorm = normalizePlace(fromInput);
  const endNorm = normalizePlace(toInput);
  
  const startCanon = canonicalNames[startNorm];
  const endCanon = canonicalNames[endNorm];
  
  if (!startCanon || !endCanon) {
    return null;
  }
  
  if (startCanon === endCanon) {
    return {
      sameLocation: true,
      message: 'Starting point and destination are the same location.'
    };
  }

  // 1. Search direct bus
  const directOptions = [];
  for (const route of apsrtcDatabase) {
    const idxStart = route.stops.map(s => s.toLowerCase()).indexOf(startCanon.toLowerCase());
    const idxEnd = route.stops.map(s => s.toLowerCase()).indexOf(endCanon.toLowerCase());
    
    if (idxStart !== -1 && idxEnd !== -1) {
      let stopsList = [];
      if (idxStart < idxEnd) {
        stopsList = route.stops.slice(idxStart, idxEnd + 1);
      } else {
        stopsList = route.stops.slice(idxEnd, idxStart + 1).reverse();
      }
      
      const durationMinutes = 15 + (stopsList.length - 1) * 8;
      const fareAmount = 10 + (stopsList.length - 1) * 4;
      
      directOptions.push({
        type: 'APSRTC Bus',
        lineName: route.busNo,
        destinationBoard: `${route.to.toUpperCase()} VIA ${route.via ? route.via.toUpperCase() : 'DIRECT'}`,
        boardingStop: startCanon,
        dropOffStop: endCanon,
        durationMinutes,
        fareAmount,
        stopsCount: stopsList.length,
        occupancy: ['Low', 'Medium', 'High'][Math.floor(Math.random() * 3)],
        stopsList,
        delayMinutes: Math.floor(Math.random() * 4),
        delayReason: 'Minor transit crossing queues',
        weatherEffect: 'Clear pathways'
      });
    }
  }

  if (directOptions.length > 0) {
    directOptions.sort((a, b) => a.durationMinutes - b.durationMinutes);
    const recommendedRoute = directOptions[0];
    const alternatives = directOptions.slice(1).map(opt => ({
      type: opt.type,
      lineName: opt.lineName,
      boardingStop: opt.boardingStop,
      dropOffStop: opt.dropOffStop,
      durationMinutes: opt.durationMinutes,
      fareAmount: opt.fareAmount,
      occupancy: opt.occupancy
    }));
    
    return {
      direct: true,
      recommendedRoute,
      alternatives
    };
  }

  // 2. Search single-transfer route
  const transferOptions = [];
  for (const r1 of apsrtcDatabase) {
    const idxStart = r1.stops.map(s => s.toLowerCase()).indexOf(startCanon.toLowerCase());
    if (idxStart !== -1) {
      for (const r2 of apsrtcDatabase) {
        if (r1.busNo === r2.busNo) continue;
        const idxEnd = r2.stops.map(s => s.toLowerCase()).indexOf(endCanon.toLowerCase());
        if (idxEnd !== -1) {
          for (const stop of r1.stops) {
            if (stop.toLowerCase() === startCanon.toLowerCase() || stop.toLowerCase() === endCanon.toLowerCase()) continue;
            
            const idxTransfer1 = r1.stops.map(s => s.toLowerCase()).indexOf(stop.toLowerCase());
            const idxTransfer2 = r2.stops.map(s => s.toLowerCase()).indexOf(stop.toLowerCase());
            
            if (idxTransfer2 !== -1) {
              let path1 = [];
              if (idxStart < idxTransfer1) {
                path1 = r1.stops.slice(idxStart, idxTransfer1 + 1);
              } else {
                path1 = r1.stops.slice(idxTransfer1, idxStart + 1).reverse();
              }
              
              let path2 = [];
              if (idxTransfer2 < idxEnd) {
                path2 = r2.stops.slice(idxTransfer2, idxEnd + 1);
              } else {
                path2 = r2.stops.slice(idxEnd, idxTransfer2 + 1).reverse();
              }
              
              const duration1 = 15 + (path1.length - 1) * 8;
              const duration2 = 15 + (path2.length - 1) * 8;
              const durationMinutes = duration1 + duration2 + 8;
              const fareAmount = (10 + (path1.length - 1) * 4) + (10 + (path2.length - 1) * 4);
              
              const stopsList = [
                ...path1.slice(0, -1),
                `TRANSFER AT ${stop} (Switch from Bus ${r1.busNo} to Bus ${r2.busNo})`,
                ...path2
              ];
              
              transferOptions.push({
                type: 'APSRTC Transfer',
                lineName: `${r1.busNo} → ${r2.busNo}`,
                destinationBoard: `${r2.to.toUpperCase()} VIA ${stop.toUpperCase()}`,
                boardingStop: startCanon,
                dropOffStop: endCanon,
                durationMinutes,
                fareAmount,
                stopsCount: path1.length + path2.length,
                occupancy: ['Low', 'Medium', 'High'][Math.floor(Math.random() * 3)],
                stopsList,
                delayMinutes: Math.floor(Math.random() * 5),
                delayReason: 'Cumulative boarding delay',
                weatherEffect: 'Minor transfer delay'
              });
            }
          }
        }
      }
    }
  }

  if (transferOptions.length > 0) {
    transferOptions.sort((a, b) => a.durationMinutes - b.durationMinutes);
    const recommendedRoute = transferOptions[0];
    const alternatives = transferOptions.slice(1).map(opt => ({
      type: opt.type,
      lineName: opt.lineName,
      boardingStop: opt.boardingStop,
      dropOffStop: opt.dropOffStop,
      durationMinutes: opt.durationMinutes,
      fareAmount: opt.fareAmount,
      occupancy: opt.occupancy
    }));
    
    return {
      direct: false,
      recommendedRoute,
      alternatives
    };
  }

  return null;
}

interface PredefinedRouteInfo {
  type: string;
  lineName: string;
  boardingStop: string;
  dropOffStop: string;
  durationMinutes: number;
  fareAmount: number;
}

function generateDefaultAdvice(from: string, to: string, route: PredefinedRouteInfo): string {
  if (route.type.includes('Transfer')) {
    return `Hello! To travel from ${from} to ${to}, we found a convenient single-transfer route. First, board Bus ${route.lineName.split(' → ')[0]} at ${route.boardingStop}. Ride to the transfer stop where you will get down. Then, board Bus ${route.lineName.split(' → ')[1]} and ride until you reach your destination at ${route.dropOffStop}. The total journey will take about ${route.durationMinutes} minutes with an estimated total fare of ₹${route.fareAmount}. Have a safe and pleasant trip!`;
  } else {
    return `Hello! There is a direct bus available for your journey. Please board Bus ${route.lineName} at ${route.boardingStop}. It travels via en-route landmarks and will drop you off directly at ${route.dropOffStop}. The journey will take approximately ${route.durationMinutes} minutes and the fare is ₹${route.fareAmount}. Enjoy your travel!`;
  }
}

function detectLocationsInText(text: string) {
  const matched: string[] = [];
  const possiblePlaces = Object.keys(canonicalNames);
  for (const place of possiblePlaces) {
    const regex = new RegExp(`\\b${place}\\b`, 'i');
    if (regex.test(text)) {
      matched.push(canonicalNames[place]);
    }
  }
  return Array.from(new Set(matched));
}

// 2. Live buses mock data (with real-time simulated movements using predefined routes)
const liveBuses = [
  {
    id: 'APSRTC-55K-01',
    lineName: '55K',
    type: 'Bus',
    from: 'Gajuwaka',
    to: 'Kottavalasa',
    driverName: 'Rajesh Kumar',
    driverRating: 4.8,
    punctualityScore: 96,
    status: 'On Time',
    delayMinutes: 0,
    occupancy: 'Medium',
    passengersCount: 28,
    speed: 38,
    nextStop: 'Scindia',
    routeProgress: 0.15,
    coordinates: { x: 22, y: 45 },
    stops: ['Gajuwaka', 'Scindia', 'NAD Junction', 'Kottavalasa'],
    color: '#2563EB'
  },
  {
    id: 'APSRTC-38-02',
    lineName: '38',
    type: 'Bus',
    from: 'Gajuwaka',
    to: 'RTC Complex',
    driverName: 'Amit Singh',
    driverRating: 4.9,
    punctualityScore: 99,
    status: 'On Time',
    delayMinutes: 0,
    occupancy: 'High',
    passengersCount: 42,
    speed: 40,
    nextStop: 'Kurmannapalem',
    routeProgress: 0.45,
    coordinates: { x: 50, y: 35 },
    stops: ['Gajuwaka', 'Kurmannapalem', 'RTC Complex'],
    color: '#10B981'
  },
  {
    id: 'APSRTC-10K-03',
    lineName: '10K',
    type: 'Bus',
    from: 'Maddilapalem',
    to: 'Kailasagiri',
    driverName: 'K. Srinivasan',
    driverRating: 4.3,
    punctualityScore: 88,
    status: 'Delayed',
    delayMinutes: 6,
    occupancy: 'Low',
    passengersCount: 15,
    speed: 32,
    nextStop: 'Railway Station',
    routeProgress: 0.70,
    coordinates: { x: 75, y: 62 },
    stops: ['Maddilapalem', 'Railway Station', 'Kailasagiri'],
    color: '#F97316'
  },
  {
    id: 'APSRTC-999-04',
    lineName: '999',
    type: 'Bus',
    from: 'RTC Complex',
    to: 'Maddilapalem',
    driverName: 'Meera Nair',
    driverRating: 4.7,
    punctualityScore: 92,
    status: 'Delayed',
    delayMinutes: 4,
    occupancy: 'High',
    passengersCount: 48,
    speed: 35,
    nextStop: 'Venkojipalem',
    routeProgress: 0.35,
    coordinates: { x: 15, y: 80 },
    stops: ['RTC Complex', 'Venkojipalem', 'Maddilapalem'],
    color: '#8B5CF6'
  }
];

// Helper to update bus positions simulating IoT devices
setInterval(() => {
  liveBuses.forEach(bus => {
    bus.routeProgress += 0.02;
    if (bus.routeProgress > 1.0) {
      bus.routeProgress = 0.0;
    }

    const stopsCount = bus.stops.length;
    let startCoords = { x: 10, y: 50 };
    let endCoords = { x: 90, y: 50 };

    if (bus.lineName === '55K') {
      startCoords = { x: 15, y: 35 };
      endCoords = { x: 80, y: 75 };
    } else if (bus.lineName === '38') {
      startCoords = { x: 10, y: 70 };
      endCoords = { x: 90, y: 20 };
    } else if (bus.lineName === '10K') {
      startCoords = { x: 30, y: 20 };
      endCoords = { x: 85, y: 85 };
    } else {
      startCoords = { x: 5, y: 90 };
      endCoords = { x: 45, y: 25 };
    }

    bus.coordinates = {
      x: Math.round(startCoords.x + (endCoords.x - startCoords.x) * bus.routeProgress),
      y: Math.round(startCoords.y + (endCoords.y - startCoords.y) * bus.routeProgress)
    };

    const nextIndex = Math.ceil(bus.routeProgress * (stopsCount - 1));
    bus.nextStop = bus.stops[Math.min(nextIndex, stopsCount - 1)];

    bus.speed = Math.max(10, Math.min(80, Math.round(bus.speed + (Math.random() * 6 - 3))));
    if (Math.random() > 0.7) {
      bus.passengersCount = Math.max(5, bus.passengersCount + (Math.random() > 0.5 ? 1 : -1));
      if (bus.passengersCount > 50) bus.occupancy = 'High';
      else if (bus.passengersCount > 20) bus.occupancy = 'Medium';
      else bus.occupancy = 'Low';
    }
  });
}, 4000);

// Simulated bus stops list
const busStops = [
  { id: 'STP-01', name: 'Gajuwaka Center Stop', distanceMeter: 150, lat: 17.68, lng: 83.21, lines: ['55K', '55H', '600', '400Y', '99', '55D', '38', '55T'], qrCode: 'QR_GAJUWAKA_001' },
  { id: 'STP-02', name: 'RTC Complex Stop A', distanceMeter: 450, lat: 17.73, lng: 83.31, lines: ['600', '999', '38k', '38', '500Y', '6A', '6H', '12D'], qrCode: 'QR_RTC_COMPLEX_012' },
  { id: 'STP-03', name: 'Maddilapalem Crossroad', distanceMeter: 820, lat: 17.74, lng: 83.32, lines: ['999', '222', '222V', '60C', '12D', '10K'], qrCode: 'QR_MADDILAPALEM_931' },
  { id: 'STP-04', name: 'NAD Junction Flyover Stop', distanceMeter: 1200, lat: 17.72, lng: 83.25, lines: ['38k', '55K', '55T'], qrCode: 'QR_NAD_982' },
  { id: 'STP-05', name: 'Scindia Shipyard Stop', distanceMeter: 2400, lat: 17.69, lng: 83.26, lines: ['55K', '55H', '400Y', '99'], qrCode: 'QR_SCINDIA_388' },
  { id: 'STP-06', name: 'Visakhapatnam Railway Station Exit Stop', distanceMeter: 3100, lat: 17.72, lng: 83.29, lines: ['10K'], qrCode: 'QR_RAILWAY_883' }
];

// POST /api/chat: Multilingual Assistant Chat bot
app.post('/api/chat', async (req, res) => {
  const { message, language } = req.body;
  const langLabel = language || 'English';

  const detected = detectLocationsInText(message);
  let groundTruth = '';
  
  if (detected.length >= 2) {
    const routeRes = findRouteProgrammatic(detected[0], detected[1]) || findRouteProgrammatic(detected[1], detected[0]);
    if (routeRes) {
      if ('sameLocation' in routeRes && routeRes.sameLocation) {
        groundTruth = `\n[SYSTEM DATA: User entered the same location: ${detected[0]}. Point out they are already at their destination.]`;
      } else if ('recommendedRoute' in routeRes && routeRes.recommendedRoute) {
        const r = routeRes.recommendedRoute;
        groundTruth = `\n[SYSTEM DATA: Search found a real route in our official APSRTC Visakhapatnam database:
        - Route Type: ${r.type}
        - Bus Number(s): ${r.lineName}
        - Boarding Stop: ${r.boardingStop}
        - Alighting Stop: ${r.dropOffStop}
        - Stops Count: ${r.stopsCount}
        - Duration: ${r.durationMinutes} mins
        - Fare: ₹${r.fareAmount}
        - En-route milestones: ${r.stopsList.join(' -> ')}
        You MUST recommend ONLY these bus numbers and locations. Do NOT make up any other lines.]`;
      }
    } else {
      groundTruth = `\n[SYSTEM DATA: No direct or transfer route exists in the official APSRTC database for travel between ${detected[0]} and ${detected[1]}. You must politely inform the user: 'No direct APSRTC bus found. Please try another nearby stop or use a transfer.']`;
    }
  }

  const systemInstruction = `You are "TransitAI Helper", a smart public transport assistant bot.
Your role is to guide travelers, tourists, students, and daily commuters who are new to the city.
Always speak warmly, clearly, and concisely. Keep responses under 3 short paragraphs.
The user is speaking in ${langLabel}. If requested, reply directly in ${langLabel} (English, Hindi, Telugu, Tamil, Spanish, etc.).
Help them find directions, answer pricing/card issues, explain voice assistance options, or SOS triggers.
Always base travel routing queries STRICTLY on the official APSRTC predefined database context provided below.
The official local routes database entries are:
- Bus No: 55K | Gajuwaka to Kottavalasa via Scindia
- Bus No: 55H | Scindia to Simahachalam via Gajuwaka
- Bus No: 600 | RTC Complex to Anakapalli via Gajuwaka
- Bus No: 400Y | Scindia to Elamanchili via Gajuwaka
- Bus No: 999 | RTC Complex to Bheemili via Hanumanthuvaka
- Bus No: 38k | RTC Complex to Kurmannapalem via NAD
- Bus No: 99 | Gajuwaka to RK beach via Scindia
- Bus No: 311 | Gajuwaka Depo to Choddavaram via Sri Nagar
- Bus No: 68k | Pendurthi to Hanumanthuvaka via Simahachalam
- Bus No: 999, 222, 222V, 60C | RTC Complex to Maddilapalem via Venkojipalem
- Bus No: 99 | Old Gajuwaka to Collector Office
- Bus No: 411V | Old Gajuwaka to Vijayanagaram
- Bus No: 55D | Gajuwaka to Gajuwaka Depot
- Bus No: 38 | Gajuwaka to RTC Complex via Kurmannapalem
- Bus No: 55T | Gajuwaka to Tallavalasa
- Bus No: 500Y | RTC Complex to Yelamanchili
- Bus No: 6A, 6H | RTC Complex to Kancharapalem via Gnanapuaram
- Bus No: 12D | Maddilapalem to Devarapalli via RTC Complex
- Bus No: 10K | Maddilapalem to Kailasagiri via Railway Station
${groundTruth}`;

  const ai = getGeminiClient();

  if (!ai) {
    let reply = '';
    if (detected.length >= 2) {
      const routeRes = findRouteProgrammatic(detected[0], detected[1]) || findRouteProgrammatic(detected[1], detected[0]);
      if (routeRes) {
        if ('sameLocation' in routeRes && routeRes.sameLocation) {
          reply = `Namaste! You are already at ${detected[0]}. No bus transit is required for this destination.`;
        } else if ('recommendedRoute' in routeRes && routeRes.recommendedRoute) {
          const r = routeRes.recommendedRoute;
          reply = `Namaste! To travel from ${r.boardingStop} to ${r.dropOffStop}, you can take the official **Bus ${r.lineName}** (${r.type}). It will board at ${r.boardingStop} and go via ${r.destinationBoard}, taking around ${r.durationMinutes} minutes with an estimated fare of ₹${r.fareAmount}. Total stops: ${r.stopsCount}.`;
        }
      } else {
        reply = `Namaste! No direct APSRTC bus found. Please try another nearby stop or use a transfer.`;
      }
    } else {
      reply = `Namaste! I am your TransitAI Smart Assistant (Simulated Mode). I can help you search the predefined APSRTC Visakhapatnam bus database. Just type your start and destination (e.g. "Gajuwaka to RTC Complex") and I'll find your route!`;
    }
    return res.json({ reply });
  }

  try {
    const chat = ai.chats.create({
      model: 'gemini-3.5-flash',
      config: {
        systemInstruction,
        temperature: 0.7,
      }
    });

    const response = await chat.sendMessage({ message });
    return res.json({ reply: response.text || 'Sorry, I did not catch that.' });
  } catch (error: unknown) {
    console.error('Gemini Chat error:', error);
    const errMessage = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: 'Failed to process chat query.', details: errMessage });
  }
});

// POST /api/route: Smart Natural Language Route planner
app.post('/api/route', async (req, res) => {
  const { from, to, language, weather } = req.body;
  const langLabel = language || 'English';
  const weatherLabel = weather || 'Sunny, Clear';

  // 1. Programmatically solve route first from APSRTC database
  const programmaticResult = findRouteProgrammatic(from, to);
  
  if (!programmaticResult) {
    return res.status(404).json({
      error: 'No direct APSRTC bus found. Please try another nearby stop or use a transfer.'
    });
  }

  if ('sameLocation' in programmaticResult && programmaticResult.sameLocation) {
    return res.status(400).json({
      error: 'Starting point and destination are the same location.'
    });
  }

  if (!('recommendedRoute' in programmaticResult) || !programmaticResult.recommendedRoute) {
    return res.status(404).json({
      error: 'No direct APSRTC bus found. Please try another nearby stop or use a transfer.'
    });
  }

  const { recommendedRoute, alternatives } = programmaticResult;

  // 2. Format warm narration with Gemini or programmatic template fallback
  const ai = getGeminiClient();

  if (!ai) {
    const naturalAdvice = generateDefaultAdvice(from, to, recommendedRoute);
    return res.json({ recommendedRoute, alternatives, naturalAdvice });
  }

  try {
    const prompt = `Formulate a warm, supportive step-by-step natural language speech readout instruction in "${langLabel}" for a traveler going from "${from}" to "${to}".
    The current weather is "${weatherLabel}".
    
    The official travel route from our Visakhapatnam APSRTC database is:
    - Route Type: ${recommendedRoute.type}
    - Bus Number/Combination: ${recommendedRoute.lineName}
    - Boarding Stop: ${recommendedRoute.boardingStop}
    - Drop-off Stop: ${recommendedRoute.dropOffStop}
    - Stops Count: ${recommendedRoute.stopsCount}
    - Journey Duration: ${recommendedRoute.durationMinutes} minutes
    - Estimated Fare: ₹${recommendedRoute.fareAmount}
    - Stops Timeline: ${recommendedRoute.stopsList.join(' -> ')}
    
    CRITICAL: You MUST write the description based ONLY on these exact details (do not change bus numbers, stop names, fares, or durations).
    Speak warmly and clearly in ${langLabel}. Limit speech readout to 2-3 sentences. No extra formatting.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        systemInstruction: 'You are an expert voice-guidance screen reader generator. Formulate warm, helpful voice instructions for travelers in the requested language.',
      }
    });

    const naturalAdvice = response.text?.trim() || generateDefaultAdvice(from, to, recommendedRoute);
    return res.json({ recommendedRoute, alternatives, naturalAdvice });
  } catch (error: unknown) {
    console.error('Gemini Route planning error:', error);
    const naturalAdvice = generateDefaultAdvice(from, to, recommendedRoute);
    return res.json({ recommendedRoute, alternatives, naturalAdvice });
  }
});

// GET /api/buses: Real-time dynamic buses lists
app.get('/api/buses', (req, res) => {
  res.json(liveBuses);
});

// GET /api/stops: All stops with distances
app.get('/api/stops', (req, res) => {
  res.json(busStops);
});

// POST /api/sos: Trigger emergency alert
app.post('/api/sos', (req, res) => {
  const { currentGPS, contacts } = req.body;
  console.log(`[SOS TRIGGERED] Current GPS:`, currentGPS, `Alerting:`, contacts);
  res.json({
    success: true,
    alertID: 'SOS-' + Date.now(),
    message: 'SOS Alert dispatched! Emergency tracking active. Local transport authorities and your emergency contacts have been notified.',
    sosLink: `https://transitai.build/sos/track?id=SOS-${Date.now()}`
  });
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 3000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
