import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit, OnDestroy, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';

export interface RouteDetail {
  type: string;
  lineName: string;
  destinationBoard: string;
  boardingStop: string;
  dropOffStop: string;
  durationMinutes: number;
  fareAmount: number;
  stopsCount: number;
  occupancy: string;
  stopsList: string[];
  delayMinutes: number;
  delayReason?: string;
  weatherEffect?: string;
}

export interface RouteResponse {
  recommendedRoute: RouteDetail;
  alternatives: {
    type: string;
    lineName: string;
    boardingStop: string;
    dropOffStop: string;
    durationMinutes: number;
    fareAmount: number;
    occupancy: string;
  }[];
  naturalAdvice: string;
}

export interface ChatMessage {
  sender: 'user' | 'bot';
  text: string;
  timestamp: Date;
}

export interface BusStop {
  id: string;
  name: string;
  distanceMeter: number;
  lat: number;
  lng: number;
  lines: string[];
  qrCode: string;
}

export interface SOSAlertDetails {
  success: boolean;
  alertID: string;
  message: string;
  sosLink: string;
}

export interface OfflineRouteItem {
  id: string;
  from: string;
  to: string;
  routeData: RouteResponse;
  savedAt: Date;
}

interface SpeechRecognitionEvent {
  results: Record<number, Record<number, { transcript: string }>>;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecogInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (ev: SpeechRecognitionEvent) => void;
  onerror: (ev: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}

export interface LiveBus {
  id: string;
  lineName: string;
  type: string;
  from: string;
  to: string;
  driverName: string;
  driverRating: number;
  punctualityScore: number;
  status: string;
  delayMinutes: number;
  occupancy: string;
  passengersCount: number;
  speed: number;
  nextStop: string;
  routeProgress: number;
  coordinates: { x: number; y: number };
  stops: string[];
  color: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  private http = inject(HttpClient);

  // Core visual state
  isDarkMode = signal<boolean>(true);
  currentTab = signal<string>('landing');
  selectedLanguage = signal<string>('English');
  isMobileMenuOpen = signal<boolean>(false);

  // App features state
  liveBuses = signal<LiveBus[]>([]);
  busStops = signal<BusStop[]>([]);
  selectedBus = signal<LiveBus | null>(null);
  selectedStop = signal<BusStop | null>(null);
  sosTriggered = signal<boolean>(false);
  sosCountdown = signal<number>(5);
  sosActive = signal<boolean>(false);
  sosAlertDetails = signal<SOSAlertDetails | null>(null);

  // Route Planning state
  selectedRoute = signal<RouteResponse | null>(null);
  routeLoading = signal<boolean>(false);
  routeError = signal<string | null>(null);
  offlineRoutes = signal<OfflineRouteItem[]>([]);
  quickSearches = signal<{from: string, to: string}[]>([
    { from: 'Gajuwaka', to: 'Kottavalasa' },
    { from: 'RTC Complex', to: 'Anakapalli' },
    { from: 'Maddilapalem', to: 'Kailasagiri' }
  ]);

  // Dynamic State additions
  journeysPlannedToday = signal<number>(0);
  activeFleetTotal = signal<number>(4);
  activeFleetOnline = signal<number>(4);
  currentWeather = signal<'Sunny' | 'Cloudy' | 'Rainy' | 'Heavy Rain'>('Sunny');
  recentSearches = signal<{from: string, to: string}[]>([]);
  fromSuggestions = signal<string[]>([]);
  toSuggestions = signal<string[]>([]);

  allVisakhaStops = [
    'Gajuwaka', 'Scindia', 'NAD Junction', 'Kottavalasa', 'Simahachalam',
    'RTC Complex', 'Anakapalli', 'Elamanchili', 'Hanumanthuvaka', 'Bheemili',
    'Kurmannapalem', 'RK Beach', 'Gajuwaka Depot', 'Sri Nagar', 'Choddavaram',
    'Pendurthi', 'Venkojipalem', 'Maddilapalem', 'Old Gajuwaka', 'Collector Office',
    'Vijayanagaram', 'Tallavalasa', 'Gnanapuaram', 'Kancharapalem', 'Kailasagiri'
  ];

  averageDelay = computed(() => {
    const route = this.selectedRoute();
    if (!route) return '0.0 Minutes';
    const from = route.recommendedRoute.boardingStop.toLowerCase();
    const to = route.recommendedRoute.dropOffStop.toLowerCase();
    
    let baseDelay = 3;
    if (from.includes('gajuwaka') && to.includes('beach')) {
      baseDelay = 2;
    } else if (from.includes('complex') && to.includes('kailasagiri')) {
      baseDelay = 5;
    } else {
      baseDelay = route.recommendedRoute.delayMinutes || 3;
    }

    const weather = this.currentWeather();
    if (weather === 'Rainy') baseDelay += 2;
    if (weather === 'Heavy Rain') baseDelay += 4;
    return `${baseDelay} Minutes`;
  });

  adjustedDuration = computed(() => {
    const route = this.selectedRoute();
    if (!route) return 0;
    let duration = route.recommendedRoute.durationMinutes;
    const weather = this.currentWeather();
    if (weather === 'Rainy') duration += 4;
    if (weather === 'Heavy Rain') duration += 8;
    return duration;
  });

  // Chatbot state
  chatMessages = signal<ChatMessage[]>([
    {
      sender: 'bot',
      text: 'Namaste! Welcome to TransitAI. I can help you find bus routes and predictions in English, Hindi, Telugu, Tamil, or Spanish. Where would you like to travel today?',
      timestamp: new Date()
    }
  ]);
  chatLoading = signal<boolean>(false);

  // Voice assistant state
  voiceAssistantEnabled = signal<boolean>(false);
  voiceListening = signal<boolean>(false);
  voiceTranscript = signal<string>('');

  // QR Code state
  qrScannerActive = signal<boolean>(false);
  qrScannedStop = signal<BusStop | null>(null);

  // Favorites state
  favoriteHome = signal<string>('Gajuwaka');
  favoriteOffice = signal<string>('RTC Complex');
  favoriteCollege = signal<string>('Kailasagiri');

  // Push notifications log
  notifications = signal<{text: string, time: Date, type: 'info' | 'alert' | 'success'}[]>([
    { text: 'TransitAI Activated: Real-time telemetry connection established.', time: new Date(), type: 'success' }
  ]);

  // Forms
  routeForm: FormGroup;
  chatForm: FormGroup;
  contactForm: FormGroup;
  configForm: FormGroup;

  // Platform and timers
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private busUpdateInterval: ReturnType<typeof setInterval> | null = null;
  private sosInterval: ReturnType<typeof setInterval> | null = null;
  private speechRecognition: SpeechRecogInstance | null = null;

  constructor() {

    // Initializing forms
    this.routeForm = new FormGroup({
      from: new FormControl('', Validators.required),
      to: new FormControl('', Validators.required)
    });

    this.chatForm = new FormGroup({
      message: new FormControl('', Validators.required)
    });

    this.contactForm = new FormGroup({
      name: new FormControl('', Validators.required),
      email: new FormControl('', [Validators.required, Validators.email]),
      subject: new FormControl('', Validators.required),
      message: new FormControl('', Validators.required)
    });

    this.configForm = new FormGroup({
      home: new FormControl('Gajuwaka'),
      office: new FormControl('RTC Complex'),
      college: new FormControl('Kailasagiri'),
      language: new FormControl('English')
    });
  }

  ngOnInit() {
    this.fetchStops();
    this.fetchBuses();

    if (this.isBrowser) {
      // Load Journeys Planned Today counter with auto-reset at 12:00 AM daily
      const todayStr = new Date().toDateString();
      const storedDate = localStorage.getItem('transit_searches_date');
      let count = 0;
      if (storedDate === todayStr) {
        const storedCount = localStorage.getItem('transit_searches_count');
        count = storedCount ? parseInt(storedCount, 10) : 0;
      } else {
        localStorage.setItem('transit_searches_date', todayStr);
        localStorage.setItem('transit_searches_count', '0');
      }
      this.journeysPlannedToday.set(count);

      // Load Recent Searches
      const storedSearches = localStorage.getItem('transit_recent_searches');
      if (storedSearches) {
        try {
          this.recentSearches.set(JSON.parse(storedSearches));
        } catch (e) {
          console.error(e);
        }
      } else {
        const defaults = [
          { from: 'Gajuwaka', to: 'RK Beach' },
          { from: 'RTC Complex', to: 'Kailasagiri' },
          { from: 'Scindia', to: 'Kottavalasa' }
        ];
        this.recentSearches.set(defaults);
        localStorage.setItem('transit_recent_searches', JSON.stringify(defaults));
      }

      // Autocomplete suggestions triggers on routeForm values changes
      this.routeForm.get('from')?.valueChanges.subscribe(val => {
        if (!val || typeof val !== 'string' || val.trim().length < 1) {
          this.fromSuggestions.set([]);
          return;
        }
        const query = val.toLowerCase().trim();
        const filtered = this.allVisakhaStops.filter(stop => 
          stop.toLowerCase().includes(query) && stop.toLowerCase() !== query
        ).slice(0, 4);
        this.fromSuggestions.set(filtered);
      });

      this.routeForm.get('to')?.valueChanges.subscribe(val => {
        if (!val || typeof val !== 'string' || val.trim().length < 1) {
          this.toSuggestions.set([]);
          return;
        }
        const query = val.toLowerCase().trim();
        const filtered = this.allVisakhaStops.filter(stop => 
          stop.toLowerCase().includes(query) && stop.toLowerCase() !== query
        ).slice(0, 4);
        this.toSuggestions.set(filtered);
      });

      // Periodically fluctuate online fleet count (4 / 4 to 3 / 4)
      setInterval(() => {
        if (Math.random() > 0.7) {
          this.activeFleetOnline.set(3);
        } else {
          this.activeFleetOnline.set(4);
        }
      }, 15000);

      // Periodic updates for live buses (simulating IoT devices)
      this.busUpdateInterval = setInterval(() => {
        this.fetchBuses();
        this.simulateArrivalNotifications();
      }, 4000);

      // Weather Auto-Cycle (simulate dynamic weather every 90 seconds)
      setInterval(() => {
        const weatherCycle: ('Sunny' | 'Cloudy' | 'Rainy' | 'Heavy Rain')[] = ['Sunny', 'Cloudy', 'Rainy', 'Heavy Rain'];
        const currentIdx = weatherCycle.indexOf(this.currentWeather());
        const nextIdx = (currentIdx + 1) % weatherCycle.length;
        this.changeWeather(weatherCycle[nextIdx]);
      }, 90000);

      // Load offline saved routes
      const saved = localStorage.getItem('transit_offline_routes');
      if (saved) {
        try {
          this.offlineRoutes.set(JSON.parse(saved));
        } catch (e) {
          console.error(e);
        }
      }

      // Load home/office settings
      const homeVal = localStorage.getItem('transit_fav_home');
      const officeVal = localStorage.getItem('transit_fav_office');
      if (homeVal) {
        this.favoriteHome.set(homeVal);
        this.configForm.patchValue({ home: homeVal });
      }
      if (officeVal) {
        this.favoriteOffice.set(officeVal);
        this.configForm.patchValue({ office: officeVal });
      }

      // Setup Web Speech API for recognition if available
      const win = window as unknown as {
        SpeechRecognition?: new () => unknown;
        webkitSpeechRecognition?: new () => unknown;
      };
      const speechConstructor = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (speechConstructor) {
        this.speechRecognition = new speechConstructor() as SpeechRecogInstance;
        this.speechRecognition.continuous = false;
        this.speechRecognition.interimResults = false;
        this.speechRecognition.lang = 'en-US';

        this.speechRecognition.onresult = (event: SpeechRecognitionEvent) => {
          const resultText = event.results[0][0].transcript;
          this.voiceTranscript.set(resultText);
          this.voiceListening.set(false);
          this.handleSpeechInput(resultText);
        };

        this.speechRecognition.onerror = (err: SpeechRecognitionErrorEvent) => {
          console.error('Speech recognition error:', err);
          this.voiceListening.set(false);
          this.pushNotification('Voice recognition error. Please try again.', 'alert');
        };

        this.speechRecognition.onend = () => {
          this.voiceListening.set(false);
        };
      }
    }
  }

  ngOnDestroy() {
    if (this.busUpdateInterval) clearInterval(this.busUpdateInterval);
    if (this.sosInterval) clearInterval(this.sosInterval);
  }

  // API Call: Fetch nearby stops
  fetchStops() {
    this.http.get<BusStop[]>('/api/stops').subscribe({
      next: (data) => {
        this.busStops.set(data);
        if (data.length > 0 && !this.selectedStop()) {
          this.selectedStop.set(data[0]);
        }
      },
      error: (err) => console.error('Failed to load stops', err)
    });
  }

  // API Call: Fetch live buses position
  fetchBuses() {
    this.http.get<LiveBus[]>('/api/buses').subscribe({
      next: (data) => {
        this.liveBuses.set(data);
        // Sync selected bus details if open
        const currentSelected = this.selectedBus();
        if (currentSelected) {
          const updated = data.find(b => b.id === currentSelected.id);
          if (updated) {
            this.selectedBus.set(updated);
          }
        }
      },
      error: (err) => console.error('Failed to load live buses', err)
    });
  }

  // API Call: Request route optimization
  planRoute() {
    if (this.routeForm.invalid) return;

    const fromVal = this.routeForm.value.from;
    const toVal = this.routeForm.value.to;

    // Clear autocomplete suggestions
    this.fromSuggestions.set([]);
    this.toSuggestions.set([]);

    const startTime = Date.now();
    this.routeLoading.set(true);
    this.routeError.set(null);
    this.selectedRoute.set(null);

    this.http.post<RouteResponse>('/api/route', {
      from: fromVal,
      to: toVal,
      language: this.selectedLanguage(),
      weather: this.currentWeather()
    }).subscribe({
      next: (res) => {
        const elapsed = Date.now() - startTime;
        const delay = Math.max(0, 2000 - elapsed);
        setTimeout(() => {
          this.selectedRoute.set(res);
          this.routeLoading.set(false);
          this.incrementJourneyCounter();
          this.currentTab.set('planner'); // Auto switch to planner to see results!

          // Add to recent searches
          if (fromVal && toVal) {
            let current = this.recentSearches().filter(s => !(s.from.toLowerCase() === fromVal.toLowerCase() && s.to.toLowerCase() === toVal.toLowerCase()));
            current = [{ from: fromVal, to: toVal }, ...current].slice(0, 5);
            this.recentSearches.set(current);
            localStorage.setItem('transit_recent_searches', JSON.stringify(current));
          }

          // Readout directions if Voice assistant enabled
          if (this.voiceAssistantEnabled() && res.naturalAdvice) {
            this.speakText(res.naturalAdvice);
          }

          this.pushNotification(`Route optimized: ${res.recommendedRoute.lineName} boarding instructions ready.`, 'success');
        }, delay);
      },
      error: (err) => {
        const elapsed = Date.now() - startTime;
        const delay = Math.max(0, 2000 - elapsed);
        setTimeout(() => {
          console.error('Routing failed', err);
          const errMsg = err.error?.error || 'No direct APSRTC bus found. Please try another nearby stop or use a transfer.';
          this.routeError.set(errMsg);
          this.routeLoading.set(false);
          this.pushNotification(errMsg, 'alert');
        }, delay);
      }
    });
  }

  // API Call: Send chat message
  sendChatMessage() {
    if (this.chatForm.invalid) return;

    const query = this.chatForm.value.message;
    this.chatForm.reset();

    // Add user message
    const updatedMessages = [...this.chatMessages(), { sender: 'user' as const, text: query, timestamp: new Date() }];
    this.chatMessages.set(updatedMessages);
    this.chatLoading.set(true);

    this.http.post<{ reply: string }>('/api/chat', {
      message: query,
      language: this.selectedLanguage()
    }).subscribe({
      next: (res) => {
        this.chatMessages.set([
          ...this.chatMessages(),
          { sender: 'bot' as const, text: res.reply, timestamp: new Date() }
        ]);
        this.chatLoading.set(false);

        // Read out if enabled
        if (this.voiceAssistantEnabled()) {
          this.speakText(res.reply);
        }
      },
      error: (err) => {
        console.error('Chat failed', err);
        this.chatMessages.set([
          ...this.chatMessages(),
          { sender: 'bot' as const, text: 'I encountered an issue connecting to the central router. Please review local timetables.', timestamp: new Date() }
        ]);
        this.chatLoading.set(false);
      }
    });
  }

  // SOS Trigger System
  triggerSOS() {
    this.sosTriggered.set(true);
    this.sosCountdown.set(5);
    this.sosActive.set(false);

    if (this.isBrowser) {
      if (this.sosInterval) clearInterval(this.sosInterval);
      this.sosInterval = setInterval(() => {
        if (this.sosCountdown() > 1) {
          this.sosCountdown.set(this.sosCountdown() - 1);
        } else {
          if (this.sosInterval) clearInterval(this.sosInterval);
          this.activateSOSAlert();
        }
      }, 1000);
    }
  }

  cancelSOS() {
    this.sosTriggered.set(false);
    this.sosActive.set(false);
    if (this.sosInterval) clearInterval(this.sosInterval);
    this.pushNotification('SOS Dispatch cancelled by user.', 'info');
  }

  activateSOSAlert() {
    this.sosActive.set(true);
    this.pushNotification('🚨 EMERGENCY RED ALERT: SOS Broadcast dispatched!', 'alert');

    this.http.post<SOSAlertDetails>('/api/sos', {
      currentGPS: { lat: 17.72, lng: 83.31 },
      contacts: [
        { name: 'Primary Contact (Mom)', phone: '+91 98765 43210' },
        { name: 'Central Transit Security Team', phone: '112 / 100' }
      ]
    }).subscribe({
      next: (res) => {
        this.sosAlertDetails.set(res);
        if (this.voiceAssistantEnabled()) {
          this.speakText('Emergency emergency! SOS triggered. Your live GPS coordinates are being transmitted to your registered contacts.');
        }
      },
      error: (err) => console.error('SOS call failed', err)
    });
  }

  // Offline route management
  saveRouteOffline() {
    const route = this.selectedRoute();
    if (!route) return;

    const fromVal = this.routeForm.value.from || 'Visakhapatnam';
    const toVal = this.routeForm.value.to || 'GITAM University';

    const item = {
      id: 'OFF-' + Date.now(),
      from: fromVal,
      to: toVal,
      routeData: route,
      savedAt: new Date()
    };

    const current = [...this.offlineRoutes(), item];
    this.offlineRoutes.set(current);

    if (this.isBrowser) {
      localStorage.setItem('transit_offline_routes', JSON.stringify(current));
    }
    this.pushNotification('Route synchronized securely for offline viewing.', 'success');
  }

  deleteOfflineRoute(id: string) {
    const current = this.offlineRoutes().filter(r => r.id !== id);
    this.offlineRoutes.set(current);
    if (this.isBrowser) {
      localStorage.setItem('transit_offline_routes', JSON.stringify(current));
    }
    this.pushNotification('Offline route deleted.', 'info');
  }

  loadOfflineRoute(item: OfflineRouteItem) {
    this.routeForm.patchValue({
      from: item.from,
      to: item.to
    });
    this.selectedRoute.set(item.routeData);
    this.currentTab.set('planner');
    this.pushNotification('Offline route loaded successfully from local storage.', 'success');
  }

  // Voice recognition and synthesis
  toggleVoiceAssistant() {
    const newState = !this.voiceAssistantEnabled();
    this.voiceAssistantEnabled.set(newState);
    if (newState) {
      this.speakText('Voice Guidance activated. Speak destination or listen to travel schedules anytime.');
      this.pushNotification('Voice assistance enabled. Screen reader narration active.', 'success');
    } else {
      this.pushNotification('Voice assistance muted.', 'info');
    }
  }

  startListening() {
    if (!this.speechRecognition) {
      this.pushNotification('Voice speech recognition is not supported in this browser.', 'alert');
      return;
    }
    this.voiceListening.set(true);
    this.voiceTranscript.set('Listening...');
    this.speechRecognition.start();
  }

  stopListening() {
    if (this.speechRecognition) {
      this.speechRecognition.stop();
    }
    this.voiceListening.set(false);
  }

  handleSpeechInput(phrase: string) {
    // Populate chat message or search based on keyword
    const lower = phrase.toLowerCase();
    if (lower.includes('go to') || lower.includes('travel to') || lower.includes('navigate')) {
      // Try to extract destination
      const match = phrase.match(/(?:go to|travel to|navigate to)\s+(.+)/i);
      const destination = match ? match[1] : phrase;
      this.routeForm.patchValue({
        from: 'Visakhapatnam Railway Station', // Default from
        to: destination
      });
      this.pushNotification(`Destination populated: ${destination}`, 'info');
      this.currentTab.set('planner');
    } else {
      // Send directly to AI Chat
      this.chatForm.patchValue({ message: phrase });
      this.sendChatMessage();
      this.currentTab.set('assistant');
    }
  }

  speakText(text: string) {
    if (!this.isBrowser) return;
    try {
      window.speechSynthesis.cancel(); // Stop current speech
      const cleanText = text.replace(/[*#]/g, ''); // strip markdown formatting
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      // Match language if possible
      if (this.selectedLanguage() === 'Hindi') utterance.lang = 'hi-IN';
      else if (this.selectedLanguage() === 'Tamil') utterance.lang = 'ta-IN';
      else if (this.selectedLanguage() === 'Telugu') utterance.lang = 'te-IN';
      else utterance.lang = 'en-US';

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('Speech synthesis failure', e);
    }
  }

  // QR code scanning simulator
  toggleQRScanner() {
    this.qrScannerActive.set(!this.qrScannerActive());
    this.qrScannedStop.set(null);
  }

  scanDemoStop(stop: BusStop) {
    this.qrScannedStop.set(stop);
    this.pushNotification(`QR Code parsed successfully: Arrived at ${stop.name}.`, 'success');
    if (this.voiceAssistantEnabled()) {
      this.speakText(`QR scanned. You are at ${stop.name}. Bus 38D is approaching in 4 minutes.`);
    }
  }

  // Favorite Destinations quick trigger
  useFavorite(type: 'home' | 'office' | 'college') {
    let dest = '';
    if (type === 'home') dest = this.favoriteHome();
    else if (type === 'office') dest = this.favoriteOffice();
    else if (type === 'college') dest = this.favoriteCollege();

    if (!dest) {
      this.pushNotification(`Please configure your ${type} address in Settings or User Dashboard first.`, 'info');
      this.currentTab.set('dashboard');
      return;
    }

    this.routeForm.patchValue({
      from: 'Visakhapatnam Railway Station', // Default starting hub
      to: dest
    });
    this.planRoute();
  }

  saveFavorites() {
    const homeVal = this.configForm.value.home;
    const officeVal = this.configForm.value.office;
    const collegeVal = this.configForm.value.college;

    this.favoriteHome.set(homeVal);
    this.favoriteOffice.set(officeVal);
    this.favoriteCollege.set(collegeVal);

    if (this.isBrowser) {
      localStorage.setItem('transit_fav_home', homeVal);
      localStorage.setItem('transit_fav_office', officeVal);
    }

    this.pushNotification('Travel profile settings updated.', 'success');
  }

  // Dynamic State Helpers
  incrementJourneyCounter() {
    if (!this.isBrowser) return;
    const todayStr = new Date().toDateString();
    const storedDate = localStorage.getItem('transit_searches_date');
    let count = 1;
    if (storedDate === todayStr) {
      const storedCount = localStorage.getItem('transit_searches_count');
      count = (storedCount ? parseInt(storedCount, 10) : 0) + 1;
    } else {
      localStorage.setItem('transit_searches_date', todayStr);
    }
    localStorage.setItem('transit_searches_count', count.toString());
    this.journeysPlannedToday.set(count);
  }

  changeWeather(newWeather: 'Sunny' | 'Cloudy' | 'Rainy' | 'Heavy Rain') {
    this.currentWeather.set(newWeather);
    this.pushNotification(`Weather update: Now simulating ${this.getWeatherEmoji(newWeather)} ${newWeather} conditions.`, 'info');
  }

  cycleWeather() {
    const weatherCycle: ('Sunny' | 'Cloudy' | 'Rainy' | 'Heavy Rain')[] = ['Sunny', 'Cloudy', 'Rainy', 'Heavy Rain'];
    const currentIdx = weatherCycle.indexOf(this.currentWeather());
    const nextIdx = (currentIdx + 1) % weatherCycle.length;
    this.changeWeather(weatherCycle[nextIdx]);
  }

  getWeatherEmoji(w: 'Sunny' | 'Cloudy' | 'Rainy' | 'Heavy Rain'): string {
    switch (w) {
      case 'Sunny': return '☀';
      case 'Cloudy': return '🌤';
      case 'Rainy': return '🌧';
      case 'Heavy Rain': return '⛈';
    }
  }

  selectFromSuggestion(stop: string) {
    this.routeForm.get('from')?.setValue(stop);
    this.fromSuggestions.set([]);
  }

  selectToSuggestion(stop: string) {
    this.routeForm.get('to')?.setValue(stop);
    this.toSuggestions.set([]);
  }

  // Navigation tab switcher
  switchTab(tab: string) {
    this.currentTab.set(tab);
    this.isMobileMenuOpen.set(false);
  }

  toggleDarkMode() {
    this.isDarkMode.set(!this.isDarkMode());
  }

  // Quick travel query search
  selectQuickSearch(search: {from: string, to: string}) {
    this.routeForm.patchValue({
      from: search.from,
      to: search.to
    });
    this.planRoute();
  }

  // Support contact form handler
  submitContactForm() {
    if (this.contactForm.invalid) return;
    this.contactForm.reset();
    this.pushNotification('Thank you for your feedback! TransitAI operators have received your request.', 'success');
  }

  // Push notifications generator
  pushNotification(text: string, type: 'info' | 'alert' | 'success') {
    const current = [{ text, time: new Date(), type }, ...this.notifications().slice(0, 10)];
    this.notifications.set(current);
  }

  // Helper arrays/data for interactive tables and heatmap
  heatmapRoutes = ['Route 38D', 'Blue Metro', 'Route 10K', 'Express 12', 'Gajuwaka Bus', 'MVP Shuttle'];
  heatmapTimes = ['07:00', '09:00', '11:00', '13:00', '15:00', '17:00', '19:00', '21:00'];
  heatmapValues: number[][] = [
    [25, 80, 45, 30, 40, 92, 75, 20], // 38D
    [35, 95, 65, 50, 55, 98, 85, 40], // Blue Metro
    [10, 45, 25, 15, 20, 50, 40, 15], // 10K
    [50, 88, 70, 40, 45, 90, 82, 35], // Express 12
    [20, 65, 40, 30, 35, 75, 60, 18], // Gajuwaka
    [15, 55, 30, 22, 25, 65, 50, 12]  // MVP
  ];

  selectedHeatmapCell = signal<{route: string, time: string, density: number} | null>({
    route: 'Blue Metro',
    time: '17:00',
    density: 98
  });

  onHeatmapCellClick(routeIdx: number, timeIdx: number) {
    this.selectedHeatmapCell.set({
      route: this.heatmapRoutes[routeIdx],
      time: this.heatmapTimes[timeIdx],
      density: this.heatmapValues[routeIdx][timeIdx]
    });
  }

  // Driver rating report list
  drivers = [
    { name: 'Rajesh Kumar', route: '38D Bus', punctuality: '98%', rating: 4.8, safetyScore: 'Excellent', status: 'On Duty' },
    { name: 'Amit Singh', route: 'Blue Metro', punctuality: '99%', rating: 4.9, safetyScore: 'Exceptional', status: 'On Duty' },
    { name: 'K. Srinivasan', route: '10K Bus', punctuality: '88%', rating: 4.3, safetyScore: 'Good', status: 'Resting' },
    { name: 'Meera Nair', route: 'Train 12', punctuality: '94%', rating: 4.7, safetyScore: 'Excellent', status: 'On Duty' },
    { name: 'Devendra Jha', route: 'Gajuwaka Express', punctuality: '91%', rating: 4.5, safetyScore: 'Excellent', status: 'On Duty' }
  ];

  commendDriver(name: string) {
    this.pushNotification(`Thank you! A commendation has been recorded for Driver ${name}. This boosts their performance bonus.`, 'success');
  }

  // Simulate arrival notifications
  private simulateArrivalNotifications() {
    const isBusSearch = this.routeForm.value.from?.toLowerCase().includes('gajuwaka') ||
                        this.routeForm.value.to?.toLowerCase().includes('kailasagiri');

    if (isBusSearch && Math.random() > 0.8) {
      const messages = [
        'Your Bus 55K is arriving in 2 minutes at Gajuwaka Center Stop. Prepare to board.',
        'Bus occupancy level is MEDIUM. Rear seating is vacant.',
        'Get ready! Your boarding gate is active at Platform 1.'
      ];
      const randomMsg = messages[Math.floor(Math.random() * messages.length)];
      this.pushNotification(randomMsg, 'info');

      if (this.voiceAssistantEnabled()) {
        this.speakText(randomMsg);
      }
    }
  }
}
