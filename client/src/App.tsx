
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import {
  ArrowLeft, CalendarDays, Check, Clock3, Film, LoaderCircle,
  LogIn, LogOut, MapPin, Plus, Search, ShieldCheck,
  Ticket, User, X, LayoutDashboard, RefreshCw, Building2,
  Monitor, Trash2, Pencil, CalendarPlus,
} from "lucide-react";
import "./App.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const http = axios.create({ baseURL: API });

type Movie = {
  id: string;
  title: string;
  description: string;
  posterUrl?: string | null;
  duration: number;
  genre: string;
  language?: string;
};

type AdminScreen = {
  id: string;
  name: string;
  seats?: { id: string }[];
  _count?: { seats: number };
};

type Cinema = {
  id: string;
  name: string;
  location: string;
  screens?: AdminScreen[];
  _count?: { screens: number };
};

type Screening = {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  movie?: Movie;
  screen: {
    id?: string;
    name: string;
    cinema: { id?: string; name: string; location: string };
  };
};

type Seat = {
  id: string;
  screeningId: string;
  status: "AVAILABLE" | "HELD" | "BOOKED";
  heldById?: string | null;
  holdExpiresAt?: string | null;
  seat: {
    id: string;
    rowLabel: string;
    seatNumber: number;
    seatType: string;
  };
};

type UserData = {
  id: string;
  name: string;
  email: string;
  role: "CUSTOMER" | "ADMIN";
};

type Booking = {
  id: string;
  bookingReference: string;
  status: string;
  totalSeats: number;
  screening: Screening;
  seats?: Array<{ screeningSeat: Seat }>;
};

type View = "home" | "movie" | "seats" | "bookings" | "admin";
type AuthMode = "login" | "register";

type SeatRowForm = {
  rowLabel: string;
  seatCount: string;
  seatType: "REGULAR" | "PREMIUM" | "RECLINER";
};

function getData<T>(response: unknown): T {
  const body = response as { data?: T };
  return body?.data as T;
}

function getList<T>(value: T[] | { movies?: T[]; cinemas?: T[]; screenings?: T[] } | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  const object = value as { movies?: T[]; cinemas?: T[]; screenings?: T[] };
  return object.movies || object.cinemas || object.screenings || [];
}

function getError(error: unknown) {
  if (axios.isAxiosError(error)) {
    return (
      error.response?.data?.message ||
      error.response?.data?.errors?.formErrors?.[0] ||
      error.message
    );
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function App() {
  const [view, setView] = useState<View>("home");

  const [movies, setMovies] = useState<Movie[]>([]);
  const [screenings, setScreenings] = useState<Screening[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [selectedScreening, setSelectedScreening] = useState<Screening | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  const [user, setUser] = useState<UserData | null>(() => {
    try {
      const saved = localStorage.getItem("cinebook_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("cinebook_token")
  );

  // Admin dashboard data
  const [adminMovies, setAdminMovies] = useState<Movie[]>([]);
  const [adminCinemas, setAdminCinemas] = useState<Cinema[]>([]);
  const [adminScreenings, setAdminScreenings] = useState<Screening[]>([]);
  const [availableScreens, setAvailableScreens] = useState<AdminScreen[]>([]);

  // Authentication
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [showAuth, setShowAuth] = useState(false);
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  // General UI state
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [holdUntil, setHoldUntil] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [bookingResult, setBookingResult] = useState<Booking | null>(null);

  // Movie form
  const [editingMovieId, setEditingMovieId] = useState<string | null>(null);
  const [movieForm, setMovieForm] = useState({
    title: "",
    description: "",
    posterUrl: "",
    duration: "",
    genre: "",
    language: "",
  });
  const [movieSaving, setMovieSaving] = useState(false);

  // Cinema form
  const [cinemaForm, setCinemaForm] = useState({
    name: "",
    location: "",
  });
  const [cinemaSaving, setCinemaSaving] = useState(false);

  // Screen form
  const [screenForm, setScreenForm] = useState({
    cinemaId: "",
    name: "",
  });
  const [screenRows, setScreenRows] = useState<SeatRowForm[]>([
    { rowLabel: "A", seatCount: "10", seatType: "REGULAR" },
    { rowLabel: "B", seatCount: "10", seatType: "REGULAR" },
    { rowLabel: "C", seatCount: "8", seatType: "PREMIUM" },
  ]);
  const [screenSaving, setScreenSaving] = useState(false);

  // Showtime form
  const [showtimeForm, setShowtimeForm] = useState({
    movieId: "",
    cinemaId: "",
    screenId: "",
    date: "",
    startTime: "",
    endTime: "",
  });
  const [showtimeSaving, setShowtimeSaving] = useState(false);

  // Attach authentication token to API requests.
  useEffect(() => {
    if (token) {
      http.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
      delete http.defaults.headers.common.Authorization;
    }
  }, [token]);

  // Load public movies.
  const loadMovies = useCallback(async () => {
    try {
      setLoading(true);
      const response = await http.get("/movies");
      setMovies(getList<Movie>(getData(response.data)));
    } catch (error) {
      setMessage(getError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMovies();
  }, [loadMovies]);

  // Load admin dashboard data.
  const loadAdminDashboard = async () => {
    if (user?.role !== "ADMIN") return;

    try {
      setLoading(true);
      setMessage("");

      const [movieResponse, cinemaResponse, screeningResponse] =
        await Promise.all([
          http.get("/movies"),
          http.get("/cinemas"),
          http.get("/screenings"),
        ]);

      setAdminMovies(
        getList<Movie>(getData(movieResponse.data))
      );
      setAdminCinemas(
        getList<Cinema>(getData(cinemaResponse.data))
      );
      setAdminScreenings(
        getList<Screening>(getData(screeningResponse.data))
      );

      setView("admin");
    } catch (error) {
      setMessage(getError(error));
    } finally {
      setLoading(false);
    }
  };

  // Restore the correct dashboard after login or page refresh.
  useEffect(() => {
    if (user?.role === "ADMIN" && token) {
      setView("admin");
      loadAdminDashboard();
    } else if (user?.role === "CUSTOMER") {
      setView("home");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, token]);

  // Load screens belonging to a selected cinema.
  const loadScreensForCinema = async (cinemaId: string) => {
    if (!cinemaId) {
      setAvailableScreens([]);
      return;
    }

    try {
      const response = await http.get(`/cinemas/${cinemaId}`);
      const result = getData<Cinema>(response.data);
      const cinema = result as Cinema & { screens?: AdminScreen[] };

      setAvailableScreens(cinema?.screens || []);
    } catch (error) {
      setAvailableScreens([]);
      setMessage(getError(error));
    }
  };

  // Customer: load showtimes for a movie.
  const loadScreenings = async (movie: Movie) => {
    setSelectedMovie(movie);
    setSelectedScreening(null);
    setSelectedSeats([]);
    setMessage("");
    setView("movie");

    try {
      setLoading(true);
      const response = await http.get("/screenings", {
        params: { movieId: movie.id },
      });

      setScreenings(
        getList<Screening>(getData(response.data))
      );
    } catch (error) {
      setMessage(getError(error));
    } finally {
      setLoading(false);
    }
  };

  const loadSeats = async (screening: Screening) => {
    setSelectedScreening(screening);
    setSelectedSeats([]);
    setMessage("");
    setView("seats");
    setHoldUntil(null);

    try {
      setLoading(true);
      const response = await http.get(`/screenings/${screening.id}/seats`);
      setSeats(getData<Seat[]>(response.data) || []);
    } catch (error) {
      setMessage(getError(error));
    } finally {
      setLoading(false);
    }
  };

  const loadBookings = async () => {
    if (!token) {
      setShowAuth(true);
      return;
    }

    try {
      setLoading(true);
      setMessage("");
      const response = await http.get("/bookings/my-bookings");
      setBookings(getData<Booking[]>(response.data) || []);
      setView("bookings");
    } catch (error) {
      setMessage(getError(error));
    } finally {
      setLoading(false);
    }
  };

  // Login and registration.
  const authenticateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthLoading(true);
    setMessage("");

    try {
      const payload =
        authMode === "register"
          ? { name: authName, email: authEmail, password: authPassword }
          : { email: authEmail, password: authPassword };

      const response = await http.post(
        authMode === "register" ? "/auth/register" : "/auth/login",
        payload
      );

      const body = response.data;
      const responseData = body.data || body;
      const accessToken = responseData.token || responseData.accessToken;
      const userData = responseData.user as UserData;

      if (!accessToken || !userData) {
        throw new Error("Authentication response did not contain a token and user.");
      }

      localStorage.setItem("cinebook_token", accessToken);
      localStorage.setItem("cinebook_user", JSON.stringify(userData));

      setToken(accessToken);
      setUser(userData);
      http.defaults.headers.common.Authorization = `Bearer ${accessToken}`;

      setShowAuth(false);
      setAuthPassword("");

      if (userData.role === "ADMIN") {
        setView("admin");
        setMessage("Welcome to the admin dashboard.");
      } else {
        setView("home");
        setMessage(`Welcome${userData.name ? `, ${userData.name}` : ""}!`);
      }
    } catch (error) {
      setMessage(getError(error));
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("cinebook_token");
    localStorage.removeItem("cinebook_user");
    setToken(null);
    setUser(null);
    setBookings([]);
    setHoldUntil(null);
    setSelectedSeats([]);
    setBookingResult(null);
    setView("home");
    setMessage("You have been signed out.");
  };

  // Customer seat booking.
  const toggleSeat = (seat: Seat) => {
    if (seat.status !== "AVAILABLE") return;

    setSelectedSeats((current) =>
      current.includes(seat.id)
        ? current.filter((id) => id !== seat.id)
        : current.length >= 10
          ? current
          : [...current, seat.id]
    );
  };

  const refreshSeats = async (screeningId: string) => {
    const response = await http.get(`/screenings/${screeningId}/seats`);
    setSeats(getData<Seat[]>(response.data) || []);
  };

  const holdSelectedSeats = async () => {
    if (!token) {
      setShowAuth(true);
      return;
    }
    if (!selectedScreening || selectedSeats.length === 0) return;

    try {
      setLoading(true);
      setMessage("");

      await http.post("/bookings/hold", {
        screeningId: selectedScreening.id,
        screeningSeatIds: selectedSeats,
      });

      const expiry = Date.now() + 5 * 60 * 1000;
      setHoldUntil(expiry);
      setSecondsLeft(300);

      await refreshSeats(selectedScreening.id);
      setMessage("Your seats are held for five minutes. Complete your booking.");
    } catch (error) {
      setMessage(getError(error));
      await refreshSeats(selectedScreening.id);
    } finally {
      setLoading(false);
    }
  };

  const confirmBooking = async () => {
    if (!selectedScreening || selectedSeats.length === 0) return;

    try {
      setLoading(true);
      setMessage("");

      const response = await http.post("/bookings/confirm", {
        screeningId: selectedScreening.id,
        screeningSeatIds: selectedSeats,
      });

      const result = getData<Booking>(response.data);
      setBookingResult(result);
      setHoldUntil(null);
      setSelectedSeats([]);
      setMessage("Booking confirmed successfully!");
      await refreshSeats(selectedScreening.id);
    } catch (error) {
      setMessage(getError(error));
      await refreshSeats(selectedScreening.id);
    } finally {
      setLoading(false);
    }
  };

  // Five-minute hold countdown.
  useEffect(() => {
    if (!holdUntil) return;

    const update = () => {
      const remaining = Math.max(
        0,
        Math.ceil((holdUntil - Date.now()) / 1000)
      );

      setSecondsLeft(remaining);

      if (remaining === 0) {
        setHoldUntil(null);
        setSelectedSeats([]);

        if (selectedScreening) {
          refreshSeats(selectedScreening.id).catch(() => { });
        }

        setMessage("Your seat hold expired. Please select your seats again.");
      }
    };

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [holdUntil, selectedScreening]);

  // Movie management.
  const resetMovieForm = () => {
    setEditingMovieId(null);
    setMovieForm({
      title: "",
      description: "",
      posterUrl: "",
      duration: "",
      genre: "",
      language: "",
    });
  };

  const editMovie = (movie: Movie) => {
    setEditingMovieId(movie.id);
    setMovieForm({
      title: movie.title,
      description: movie.description,
      posterUrl: movie.posterUrl || "",
      duration: String(movie.duration),
      genre: movie.genre,
      language: movie.language || "",
    });

    document.getElementById("movie-form")?.scrollIntoView({
      behavior: "smooth",
    });
  };

  const saveMovie = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (user?.role !== "ADMIN") return;

    try {
      setMovieSaving(true);
      setMessage("");

      const payload = {
        title: movieForm.title.trim(),
        description: movieForm.description.trim(),
        posterUrl: movieForm.posterUrl.trim(),
        duration: Number(movieForm.duration),
        genre: movieForm.genre.trim(),
        language: movieForm.language.trim(),
      };

      if (editingMovieId) {
        await http.patch(`/admin/movies/${editingMovieId}`, payload);
        setMessage("Movie updated successfully.");
      } else {
        await http.post("/admin/movies", payload);
        setMessage("Movie added successfully.");
      }

      resetMovieForm();
      await loadAdminDashboard();
    } catch (error) {
      setMessage(getError(error));
    } finally {
      setMovieSaving(false);
    }
  };

  const deleteMovie = async (movie: Movie) => {
    if (user?.role !== "ADMIN") return;

    if (!window.confirm(`Are you sure you want to delete "${movie.title}"?`)) {
      return;
    }

    try {
      setLoading(true);
      setMessage("");
      await http.delete(`/admin/movies/${movie.id}`);

      if (editingMovieId === movie.id) resetMovieForm();

      setMessage("Movie deleted successfully.");
      await loadAdminDashboard();
    } catch (error) {
      setMessage(getError(error));
    } finally {
      setLoading(false);
    }
  };

  // Cinema management.
  const createCinema = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (user?.role !== "ADMIN") return;

    try {
      setCinemaSaving(true);
      setMessage("");

      await http.post("/admin/cinemas", {
        name: cinemaForm.name.trim(),
        location: cinemaForm.location.trim(),
      });

      setCinemaForm({ name: "", location: "" });
      setMessage("Cinema created successfully.");
      await loadAdminDashboard();
    } catch (error) {
      setMessage(getError(error));
    } finally {
      setCinemaSaving(false);
    }
  };

  // Screen management.
  const createScreen = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (user?.role !== "ADMIN") return;

    const validRows = screenRows.filter(
      (row) => row.rowLabel.trim() && Number(row.seatCount) > 0
    );

    if (!validRows.length) {
      setMessage("Add at least one valid seat row.");
      return;
    }

    try {
      setScreenSaving(true);
      setMessage("");

      await http.post("/admin/screens", {
        cinemaId: screenForm.cinemaId,
        name: screenForm.name.trim(),
        rows: validRows.map((row) => ({
          rowLabel: row.rowLabel.trim().toUpperCase(),
          seatCount: Number(row.seatCount),
          seatType: row.seatType,
        })),
      });

      setScreenForm({ cinemaId: "", name: "" });
      setScreenRows([
        { rowLabel: "A", seatCount: "10", seatType: "REGULAR" },
        { rowLabel: "B", seatCount: "10", seatType: "REGULAR" },
        { rowLabel: "C", seatCount: "8", seatType: "PREMIUM" },
      ]);

      setMessage("Screen and seats created successfully.");
      await loadAdminDashboard();
    } catch (error) {
      setMessage(getError(error));
    } finally {
      setScreenSaving(false);
    }
  };

  const updateScreenRow = (
    index: number,
    field: keyof SeatRowForm,
    value: string
  ) => {
    setScreenRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      )
    );
  };

  // Showtime management.
  const handleShowtimeCinemaChange = async (cinemaId: string) => {
    setShowtimeForm((current) => ({
      ...current,
      cinemaId,
      screenId: "",
    }));

    await loadScreensForCinema(cinemaId);
  };

  const createShowtime = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (user?.role !== "ADMIN") return;

    try {
      setShowtimeSaving(true);
      setMessage("");

      const start = new Date(
        `${showtimeForm.date}T${showtimeForm.startTime}`
      );
      const end = new Date(
        `${showtimeForm.date}T${showtimeForm.endTime}`
      );

      if (
        !showtimeForm.date ||
        !showtimeForm.startTime ||
        !showtimeForm.endTime ||
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime())
      ) {
        throw new Error("Please provide a valid date and time.");
      }

      if (end <= start) {
        throw new Error("End time must be later than start time.");
      }

      await http.post("/admin/screenings", {
        movieId: showtimeForm.movieId,
        screenId: showtimeForm.screenId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });

      setShowtimeForm({
        movieId: "",
        cinemaId: "",
        screenId: "",
        date: "",
        startTime: "",
        endTime: "",
      });
      setAvailableScreens([]);

      setMessage("Showtime created successfully.");
      await loadAdminDashboard();
    } catch (error) {
      setMessage(getError(error));
    } finally {
      setShowtimeSaving(false);
    }
  };

  const filteredMovies = movies.filter((movie) =>
    `${movie.title} ${movie.genre}`.toLowerCase().includes(search.toLowerCase())
  );

  const seatRows = Array.from(
    new Set(seats.map((seat) => seat.seat.rowLabel))
  ).sort();

  return (
    <div className="app-shell">
      <header className="navbar">
        <button
          className="brand"
          onClick={() => {
            if (user?.role === "ADMIN") {
              setView("admin");
              loadAdminDashboard();
            } else {
              setView("home");
              setBookingResult(null);
            }
          }}
        >
          <span className="brand-mark"><Film size={21} /></span>
          <span>CINE<span className="brand-accent">BOOK</span></span>
        </button>

        <nav className="nav-links">
          {user?.role === "ADMIN" ? (
            <>
              <button
                className={view === "admin" ? "nav-active" : ""}
                onClick={loadAdminDashboard}
              >
                <LayoutDashboard size={15} /> Dashboard
              </button>
              <button
                className={view === "home" ? "nav-active" : ""}
                onClick={() => setView("home")}
              >
                Customer view
              </button>
            </>
          ) : (
            <>
              <button
                className={view === "home" ? "nav-active" : ""}
                onClick={() => setView("home")}
              >
                Explore
              </button>
              <button
                className={view === "bookings" ? "nav-active" : ""}
                onClick={loadBookings}
              >
                My bookings
              </button>
            </>
          )}
        </nav>

        <div className="nav-account">
          {user ? (
            <>
              <span className="user-greeting">
                <User size={15} /> {user.name}
                {user.role === "ADMIN" && (
                  <span className="admin-role-label">ADMIN</span>
                )}
              </span>
              <button className="icon-button" title="Sign out" onClick={logout}>
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <button
              className="login-button"
              onClick={() => {
                setAuthMode("login");
                setShowAuth(true);
              }}
            >
              <LogIn size={16} /> Sign in
            </button>
          )}
        </div>
      </header>

      <main>
        {/* ADMIN DASHBOARD */}
        {view === "admin" && user?.role === "ADMIN" && (
          <section className="inner-page admin-page">
            <div className="admin-heading">
              <div>
                <span className="eyebrow">CINEBOOK MANAGEMENT</span>
                <h1 className="page-title">Admin dashboard</h1>
                <p>Welcome, {user.name}. Manage your cinema operations.</p>
              </div>
              <button
                className="secondary-button"
                onClick={loadAdminDashboard}
                disabled={loading}
              >
                {loading ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}
                Refresh
              </button>
            </div>

            {message && (
              <div className="notice">
                {message}
                <button onClick={() => setMessage("")}><X size={15} /></button>
              </div>
            )}

            <div className="admin-stats">
              <article className="admin-stat-card">
                <div className="admin-stat-icon"><Film size={23} /></div>
                <span>Total movies</span>
                <strong>{adminMovies.length}</strong>
              </article>
              <article className="admin-stat-card">
                <div className="admin-stat-icon"><MapPin size={23} /></div>
                <span>Total cinemas</span>
                <strong>{adminCinemas.length}</strong>
              </article>
              <article className="admin-stat-card">
                <div className="admin-stat-icon"><CalendarDays size={23} /></div>
                <span>Total screenings</span>
                <strong>{adminScreenings.length}</strong>
              </article>
            </div>

            {/* MOVIE FORM */}
            <div className="admin-section" id="movie-form">
              <div className="admin-section-heading">
                <h2><Film size={20} /> {editingMovieId ? "Edit movie" : "Add new movie"}</h2>
              </div>

              <form className="admin-movie-form" onSubmit={saveMovie}>
                <div className="admin-form-grid">
                  <label>
                    Movie title *
                    <input
                      value={movieForm.title}
                      onChange={(e) => setMovieForm({ ...movieForm, title: e.target.value })}
                      placeholder="e.g. Interstellar"
                      required
                      maxLength={150}
                    />
                  </label>
                  <label>
                    Genre *
                    <input
                      value={movieForm.genre}
                      onChange={(e) => setMovieForm({ ...movieForm, genre: e.target.value })}
                      placeholder="e.g. Sci-Fi"
                      required
                      maxLength={80}
                    />
                  </label>
                  <label>
                    Duration (minutes) *
                    <input
                      type="number"
                      value={movieForm.duration}
                      onChange={(e) => setMovieForm({ ...movieForm, duration: e.target.value })}
                      placeholder="169"
                      min="1"
                      required
                    />
                  </label>
                  <label>
                    Language
                    <input
                      value={movieForm.language}
                      onChange={(e) => setMovieForm({ ...movieForm, language: e.target.value })}
                      placeholder="English"
                      maxLength={50}
                    />
                  </label>
                </div>

                <label>
                  Poster image URL
                  <input
                    type="url"
                    value={movieForm.posterUrl}
                    onChange={(e) => setMovieForm({ ...movieForm, posterUrl: e.target.value })}
                    placeholder="https://example.com/movie-poster.jpg"
                  />
                </label>

                <label>
                  Description *
                  <textarea
                    value={movieForm.description}
                    onChange={(e) => setMovieForm({ ...movieForm, description: e.target.value })}
                    placeholder="Enter the movie description..."
                    required
                    rows={4}
                  />
                </label>

                <div className="admin-form-actions">
                  <button type="submit" className="primary-button" disabled={movieSaving}>
                    {movieSaving ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
                    {editingMovieId ? "Update movie" : "Add movie"}
                  </button>
                  {editingMovieId && (
                    <button type="button" className="secondary-button" onClick={resetMovieForm}>
                      <X size={16} /> Cancel editing
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* MOVIE LIST */}
            <div className="admin-section">
              <div className="admin-section-heading">
                <h2><Film size={20} /> Manage movies</h2>
                <span>{adminMovies.length} movies</span>
              </div>

              {adminMovies.length === 0 ? (
                <p className="admin-empty">No movies available. Add your first movie above.</p>
              ) : (
                <div className="admin-data-list">
                  {adminMovies.map((movie) => (
                    <div className="admin-data-row" key={movie.id}>
                      <div className="admin-movie-info">
                        {movie.posterUrl ? (
                          <img src={movie.posterUrl} alt={movie.title} />
                        ) : (
                          <div className="admin-poster-placeholder"><Film size={20} /></div>
                        )}
                        <div>
                          <strong>{movie.title}</strong>
                          <p>{movie.genre} · {movie.duration} minutes</p>
                          <p>{movie.language || "Language not specified"}</p>
                        </div>
                      </div>
                      <div className="admin-movie-actions">
                        <button type="button" className="admin-edit-button" onClick={() => editMovie(movie)}>
                          <Pencil size={14} /> Edit
                        </button>
                        <button
                          type="button"
                          className="admin-delete-button"
                          disabled={loading}
                          onClick={() => deleteMovie(movie)}
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CINEMA MANAGEMENT */}
            <div className="admin-section" id="cinema-management">
              <div className="admin-section-heading">
                <h2><Building2 size={20} /> Cinema management</h2>
                <span>{adminCinemas.length} cinemas</span>
              </div>

              <form className="admin-movie-form" onSubmit={createCinema}>
                <div className="admin-form-grid">
                  <label>
                    Cinema name *
                    <input
                      value={cinemaForm.name}
                      onChange={(e) => setCinemaForm({ ...cinemaForm, name: e.target.value })}
                      placeholder="e.g. CineBook Delhi"
                      required
                      maxLength={150}
                    />
                  </label>
                  <label>
                    Location *
                    <input
                      value={cinemaForm.location}
                      onChange={(e) => setCinemaForm({ ...cinemaForm, location: e.target.value })}
                      placeholder="e.g. Connaught Place, Delhi"
                      required
                      maxLength={255}
                    />
                  </label>
                </div>
                <button type="submit" className="primary-button" disabled={cinemaSaving}>
                  {cinemaSaving ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
                  Add cinema
                </button>
              </form>

              <div className="admin-data-list">
                {adminCinemas.length === 0 ? (
                  <p className="admin-empty">No cinemas available.</p>
                ) : adminCinemas.map((cinema) => (
                  <div className="admin-data-row" key={cinema.id}>
                    <div>
                      <strong>{cinema.name}</strong>
                      <p><MapPin size={13} /> {cinema.location}</p>
                    </div>
                    <span className="admin-status">ACTIVE</span>
                  </div>
                ))}
              </div>
            </div>

            {/* SCREEN MANAGEMENT */}
            <div className="admin-section" id="screen-management">
              <div className="admin-section-heading">
                <h2><Monitor size={20} /> Screen management</h2>
              </div>

              <form className="admin-movie-form" onSubmit={createScreen}>
                <div className="admin-form-grid">
                  <label>
                    Select cinema *
                    <select
                      value={screenForm.cinemaId}
                      onChange={(e) => setScreenForm({ ...screenForm, cinemaId: e.target.value })}
                      required
                    >
                      <option value="">Choose a cinema</option>
                      {adminCinemas.map((cinema) => (
                        <option key={cinema.id} value={cinema.id}>{cinema.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Screen name *
                    <input
                      value={screenForm.name}
                      onChange={(e) => setScreenForm({ ...screenForm, name: e.target.value })}
                      placeholder="e.g. Screen 2"
                      required
                      maxLength={80}
                    />
                  </label>
                </div>

                <div className="admin-section-heading">
                  <h3>Seat layout</h3>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setScreenRows((rows) => [
                      ...rows,
                      {
                        rowLabel: String.fromCharCode(65 + rows.length),
                        seatCount: "10",
                        seatType: "REGULAR",
                      },
                    ])}
                  >
                    <Plus size={15} /> Add row
                  </button>
                </div>

                {screenRows.map((row, index) => (
                  <div className="admin-form-grid seat-row-form" key={index}>
                    <label>
                      Row label *
                      <input
                        value={row.rowLabel}
                        onChange={(e) => updateScreenRow(index, "rowLabel", e.target.value)}
                        maxLength={5}
                        required
                      />
                    </label>
                    <label>
                      Number of seats *
                      <input
                        type="number"
                        value={row.seatCount}
                        onChange={(e) => updateScreenRow(index, "seatCount", e.target.value)}
                        min="1"
                        max="30"
                        required
                      />
                    </label>
                    <label>
                      Seat type
                      <select
                        value={row.seatType}
                        onChange={(e) => updateScreenRow(index, "seatType", e.target.value)}
                      >
                        <option value="REGULAR">Regular</option>
                        <option value="PREMIUM">Premium</option>
                        <option value="RECLINER">Recliner</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="admin-delete-button"
                      disabled={screenRows.length === 1}
                      onClick={() => setScreenRows((rows) => rows.filter((_, i) => i !== index))}
                      title="Remove row"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}

                <p className="admin-empty">
                  Each row generates physical seats automatically. You can add up to 20 rows, with up to 30 seats per row.
                </p>

                <button type="submit" className="primary-button" disabled={screenSaving || adminCinemas.length === 0}>
                  {screenSaving ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
                  Create screen and seats
                </button>
              </form>

              <div className="admin-data-list">
                {adminCinemas.map((cinema) => (
                  <div className="admin-data-row" key={cinema.id}>
                    <div>
                      <strong>{cinema.name}</strong>
                      <p>{cinema._count?.screens ?? "—"} screens</p>
                    </div>
                    <span className="admin-status">{cinema.location}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* SHOWTIME MANAGEMENT */}
            <div className="admin-section" id="showtime-management">
              <div className="admin-section-heading">
                <h2><CalendarPlus size={20} /> Manage showtimes</h2>
                <span>{adminScreenings.length} screenings</span>
              </div>

              <form className="admin-movie-form" onSubmit={createShowtime}>
                <div className="admin-form-grid">
                  <label>
                    Select movie *
                    <select
                      value={showtimeForm.movieId}
                      onChange={(e) => setShowtimeForm({ ...showtimeForm, movieId: e.target.value })}
                      required
                    >
                      <option value="">Choose a movie</option>
                      {adminMovies.map((movie) => (
                        <option key={movie.id} value={movie.id}>{movie.title}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Select cinema *
                    <select
                      value={showtimeForm.cinemaId}
                      onChange={(e) => handleShowtimeCinemaChange(e.target.value)}
                      required
                    >
                      <option value="">Choose a cinema</option>
                      {adminCinemas.map((cinema) => (
                        <option key={cinema.id} value={cinema.id}>{cinema.name}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Select screen *
                    <select
                      value={showtimeForm.screenId}
                      onChange={(e) => setShowtimeForm({ ...showtimeForm, screenId: e.target.value })}
                      required
                      disabled={!showtimeForm.cinemaId}
                    >
                      <option value="">Choose a screen</option>
                      {availableScreens.map((screen) => (
                        <option key={screen.id} value={screen.id}>{screen.name}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Date *
                    <input
                      type="date"
                      value={showtimeForm.date}
                      onChange={(e) => setShowtimeForm({ ...showtimeForm, date: e.target.value })}
                      min={new Date().toLocaleDateString("en-CA")}
                      required
                    />
                  </label>

                  <label>
                    Start time *
                    <input
                      type="time"
                      value={showtimeForm.startTime}
                      onChange={(e) => setShowtimeForm({ ...showtimeForm, startTime: e.target.value })}
                      required
                    />
                  </label>

                  <label>
                    End time *
                    <input
                      type="time"
                      value={showtimeForm.endTime}
                      onChange={(e) => setShowtimeForm({ ...showtimeForm, endTime: e.target.value })}
                      required
                    />
                  </label>
                </div>

                <p className="admin-empty">
                  Select a movie and screen to schedule a show. The backend checks for overlapping screenings and generates the screening's seat inventory.
                </p>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={showtimeSaving || !adminMovies.length || !adminCinemas.length || !availableScreens.length}
                >
                  {showtimeSaving ? <LoaderCircle className="spin" size={17} /> : <CalendarPlus size={17} />}
                  Create showtime
                </button>
              </form>

              <div className="admin-section-heading">
                <h3>Scheduled showtimes</h3>
              </div>

              {adminScreenings.length === 0 ? (
                <p className="admin-empty">No screenings available. Create your first showtime above.</p>
              ) : (
                <div className="admin-data-list">
                  {adminScreenings.map((screening) => (
                    <div className="admin-data-row" key={screening.id}>
                      <div>
                        <strong>{screening.movie?.title || "Movie"}</strong>
                        <p>{screening.screen?.cinema?.name} · {screening.screen?.name}</p>
                        <p>
                          <CalendarDays size={13} /> {formatDate(screening.startTime)}
                          {" · "}
                          <Clock3 size={13} /> {formatTime(screening.startTime)}
                          {" – "}
                          {formatTime(screening.endTime)}
                        </p>
                      </div>
                      <span className="admin-status">{screening.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="admin-info-note">
              <ShieldCheck size={18} />
              <p>
                You are signed in with administrator access. All administrative API operations remain protected by the backend.
              </p>
            </div>
          </section>
        )}

        {/* CUSTOMER HOME */}
        {view === "home" && (
          <>
            <section className="hero-banner">
              <div className="hero-content">
                <span className="eyebrow">
                  <span className="live-dot" /> YOUR MOVIE NIGHT STARTS HERE
                </span>
                <h1>Stories worth<br /><span>watching.</span></h1>
                <p>Discover movies, pick your seats, and make every moment count.</p>
                <button
                  className="primary-button"
                  onClick={() => document.getElementById("movies")?.scrollIntoView({ behavior: "smooth" })}
                >
                  Explore movies <ArrowLeft className="arrow-down" size={17} />
                </button>
              </div>

              <div className="hero-art">
                <div className="hero-orbit orbit-one" />
                <div className="hero-orbit orbit-two" />
                <div className="hero-ticket"><Ticket size={76} strokeWidth={1.1} /></div>
                <span className="hero-star star-one">✦</span>
                <span className="hero-star star-two">✧</span>
              </div>
              <div className="hero-bottom">THE BIG SCREEN IS CALLING <span>✦</span></div>
            </section>

            <section className="movies-section" id="movies">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">NOW SHOWING</span>
                  <h2>Find your next <span>favourite.</span></h2>
                </div>
                <label className="search-box">
                  <Search size={17} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search movies..." />
                </label>
              </div>

              {message && (
                <div className="notice">
                  {message}
                  <button onClick={() => setMessage("")}><X size={15} /></button>
                </div>
              )}

              {loading && movies.length === 0 ? (
                <div className="loading-state"><LoaderCircle className="spin" /> Loading movies...</div>
              ) : filteredMovies.length === 0 ? (
                <div className="empty-state">
                  <Film size={35} />
                  <h3>No movies found</h3>
                  <p>Movies added by the cinema admin will appear here.</p>
                </div>
              ) : (
                <div className="movie-grid">
                  {filteredMovies.map((movie, index) => (
                    <article className="movie-card" key={movie.id} onClick={() => loadScreenings(movie)}>
                      <div className={`movie-poster poster-${index % 5}`}>
                        {movie.posterUrl ? <img src={movie.posterUrl} alt={movie.title} /> : <Film size={45} />}
                        <span className="poster-tag">NOW SHOWING</span>
                        <button className="poster-action" aria-label={`View ${movie.title}`}><Plus size={19} /></button>
                      </div>
                      <div className="movie-info">
                        <div className="movie-meta">{movie.genre} <span>•</span> {movie.duration} min</div>
                        <h3>{movie.title}</h3>
                        <p>{movie.language || "Original"} <span>·</span> Available now</p>
                        <button className="text-button">View showtimes <span>↗</span></button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {/* MOVIE DETAILS */}
        {view === "movie" && selectedMovie && (
          <section className="inner-page">
            <button className="back-button" onClick={() => setView("home")}>
              <ArrowLeft size={17} /> All movies
            </button>

            <div className="detail-layout">
              <div className="detail-poster">
                {selectedMovie.posterUrl ? <img src={selectedMovie.posterUrl} alt={selectedMovie.title} /> : <Film size={70} />}
              </div>

              <div className="detail-content">
                <span className="eyebrow">MOVIE DETAILS</span>
                <h1>{selectedMovie.title}</h1>
                <div className="detail-meta">
                  {selectedMovie.genre} <span>•</span> {selectedMovie.duration} min <span>•</span> {selectedMovie.language || "Original"}
                </div>
                <p className="detail-description">{selectedMovie.description}</p>
                <div className="showtime-heading"><CalendarDays size={19} /> Select a showtime</div>

                {loading ? (
                  <div className="loading-state"><LoaderCircle className="spin" /> Finding showtimes...</div>
                ) : screenings.length === 0 ? (
                  <div className="empty-inline">No upcoming showtimes are available for this movie yet.</div>
                ) : (
                  <div className="showtime-list">
                    {screenings.map((screening) => (
                      <button className="showtime-card" key={screening.id} onClick={() => loadSeats(screening)}>
                        <span className="show-date">{formatDate(screening.startTime)}</span>
                        <strong>{formatTime(screening.startTime)}</strong>
                        <span className="show-cinema">{screening.screen?.cinema?.name || "Cinema"} · {screening.screen?.name}</span>
                        <span className="show-arrow">→</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* SEAT SELECTION */}
        {view === "seats" && selectedScreening && selectedMovie && (
          <section className="inner-page seat-page">
            <button
              className="back-button"
              onClick={() => {
                setView("movie");
                setHoldUntil(null);
                setSelectedSeats([]);
              }}
            >
              <ArrowLeft size={17} /> Back to showtimes
            </button>

            <div className="seat-title">
              <span className="eyebrow">SELECT YOUR SEATS</span>
              <h1>{selectedMovie.title}</h1>
              <p>
                <MapPin size={15} /> {selectedScreening.screen.cinema.name} · {selectedScreening.screen.name}
                {" "} <span>•</span> {formatDate(selectedScreening.startTime)}, {formatTime(selectedScreening.startTime)}
              </p>
            </div>

            <div className="seat-layout">
              <div className="seat-main">
                <div className="screen-visual">
                  <div className="screen-line" />
                  <span>SCREEN THIS WAY</span>
                </div>

                <div className="seat-legend">
                  <span><i className="legend-seat available" /> Available</span>
                  <span><i className="legend-seat selected" /> Selected</span>
                  <span><i className="legend-seat occupied" /> Unavailable</span>
                  <span><i className="legend-seat premium" /> Premium</span>
                </div>

                {loading && seats.length === 0 ? (
                  <div className="loading-state"><LoaderCircle className="spin" /> Loading seats...</div>
                ) : (
                  <div className="seat-map">
                    {seatRows.map((row) => (
                      <div className="seat-row" key={row}>
                        <span className="row-label">{row}</span>
                        <div className="seat-row-items">
                          {seats
                            .filter((seat) => seat.seat.rowLabel === row)
                            .sort((a, b) => a.seat.seatNumber - b.seat.seatNumber)
                            .map((seat) => {
                              const isSelected = selectedSeats.includes(seat.id);
                              const ownHeld = seat.status === "HELD" && seat.heldById === user?.id;
                              const unavailable = seat.status !== "AVAILABLE" && !ownHeld;

                              return (
                                <button
                                  key={seat.id}
                                  title={`${row}${seat.seat.seatNumber} · ${seat.seat.seatType}`}
                                  disabled={unavailable || (!!holdUntil && !ownHeld)}
                                  onClick={() => toggleSeat(seat)}
                                  className={`seat ${seat.seat.seatType.toLowerCase()} ${isSelected || ownHeld ? "selected" : ""} ${unavailable ? "occupied" : ""}`}
                                >
                                  {seat.seat.seatNumber}
                                </button>
                              );
                            })}
                        </div>
                        <span className="row-label">{row}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="seat-footnote">
                  Seats are held for five minutes after you continue. A maximum of 10 seats can be selected.
                </div>
              </div>

              <aside className="booking-summary">
                <span className="eyebrow">YOUR SELECTION</span>
                <h3>Booking summary</h3>
                <div className="summary-line"><span>Movie</span><strong>{selectedMovie.title}</strong></div>
                <div className="summary-line"><span>Showtime</span><strong>{formatTime(selectedScreening.startTime)}</strong></div>
                <div className="summary-line"><span>Date</span><strong>{formatDate(selectedScreening.startTime)}</strong></div>
                <div className="summary-line"><span>Seats</span><strong>{selectedSeats.length || "—"}</strong></div>

                <div className="selected-seat-list">
                  {selectedSeats.map((id) => {
                    const seat = seats.find((item) => item.id === id);
                    return seat ? `${seat.seat.rowLabel}${seat.seat.seatNumber}` : "";
                  }).filter(Boolean).join(", ") || "No seats selected"}
                </div>

                {holdUntil && (
                  <div className="hold-timer">
                    <Clock3 size={17} />
                    <div>
                      <small>TIME LEFT TO CONFIRM</small>
                      <strong>
                        {String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:
                        {String(secondsLeft % 60).padStart(2, "0")}
                      </strong>
                    </div>
                  </div>
                )}

                {message && <div className="summary-message">{message}</div>}

                {!holdUntil ? (
                  <button className="primary-button full-button" disabled={!selectedSeats.length || loading} onClick={holdSelectedSeats}>
                    {loading ? <LoaderCircle className="spin" size={17} /> : <Ticket size={17} />}
                    Hold selected seats
                  </button>
                ) : (
                  <button className="primary-button full-button" disabled={loading || secondsLeft === 0} onClick={confirmBooking}>
                    {loading ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}
                    Confirm booking
                  </button>
                )}

                <p className="secure-note"><ShieldCheck size={13} /> Secure booking · No payment required</p>
              </aside>
            </div>
          </section>
        )}

        {/* CUSTOMER BOOKINGS */}
        {view === "bookings" && (
          <section className="inner-page">
            <span className="eyebrow">YOUR CINEBOOK ACCOUNT</span>
            <h1 className="page-title">My bookings</h1>

            {loading ? (
              <div className="loading-state"><LoaderCircle className="spin" /> Loading bookings...</div>
            ) : bookings.length === 0 ? (
              <div className="empty-state">
                <Ticket size={36} />
                <h3>No bookings yet</h3>
                <p>Your confirmed movie tickets will appear here.</p>
                <button className="primary-button" onClick={() => setView("home")}>Explore movies</button>
              </div>
            ) : (
              <div className="booking-list">
                {bookings.map((booking) => (
                  <article className="booking-card" key={booking.id}>
                    <div className="booking-icon"><Ticket size={26} /></div>
                    <div className="booking-info">
                      <span className="eyebrow">{booking.status}</span>
                      <h3>{booking.screening?.movie?.title || "Movie booking"}</h3>
                      <p>{booking.screening?.screen?.cinema?.name} · {booking.screening?.screen?.name}</p>
                      <p>
                        {booking.screening?.startTime ? formatDate(booking.screening.startTime) : ""}
                        {" · "}
                        {booking.screening?.startTime ? formatTime(booking.screening.startTime) : ""}
                      </p>
                      <small>Booking reference: {booking.bookingReference}</small>
                    </div>
                    <div className="booking-count">{booking.totalSeats}<small>SEATS</small></div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {/* BOOKING SUCCESS */}
        {bookingResult && (
          <div className="success-overlay">
            <div className="success-card">
              <button
                className="modal-close"
                onClick={() => {
                  setBookingResult(null);
                  setView("bookings");
                  loadBookings();
                }}
              >
                <X size={19} />
              </button>
              <div className="success-check"><Check size={34} /></div>
              <span className="eyebrow">IT'S A MOVIE NIGHT!</span>
              <h2>Booking confirmed</h2>
              <p>Your seats are secured. Enjoy the show!</p>
              <div className="ticket-reference">
                <small>YOUR BOOKING REFERENCE</small>
                <strong>{bookingResult.bookingReference || bookingResult.id}</strong>
              </div>
              <button
                className="primary-button full-button"
                onClick={() => {
                  setBookingResult(null);
                  loadBookings();
                }}
              >
                View my bookings
              </button>
              <button
                className="text-button centered"
                onClick={() => {
                  setBookingResult(null);
                  setView("home");
                }}
              >
                Back to movies
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <button
          className="brand footer-brand"
          onClick={() => setView(user?.role === "ADMIN" ? "admin" : "home")}
        >
          <span className="brand-mark"><Film size={18} /></span>
          CINE<span className="brand-accent">BOOK</span>
        </button>
        <span>Made for movie lovers. © {new Date().getFullYear()} CineBook.</span>
        <span>Discover · Book · Enjoy</span>
      </footer>

      {/* AUTH MODAL */}
      {showAuth && (
        <div className="modal-overlay" onClick={() => setShowAuth(false)}>
          <div className="auth-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowAuth(false)}><X size={19} /></button>
            <div className="auth-logo"><Film size={24} /></div>
            <span className="eyebrow">WELCOME TO CINEBOOK</span>
            <h2>{authMode === "login" ? "Welcome back." : "Create your account."}</h2>
            <p>
              {authMode === "login"
                ? "Sign in to reserve your favourite seats."
                : "Join us and book your next movie night."}
            </p>

            <form onSubmit={authenticateUser}>
              {authMode === "register" && (
                <input
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  placeholder="Full name"
                  required
                  minLength={2}
                />
              )}
              <input
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="Email address"
                required
              />
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Password"
                required
                minLength={8}
              />
              {message && <div className="summary-message">{message}</div>}
              <button className="primary-button full-button" disabled={authLoading}>
                {authLoading && <LoaderCircle className="spin" size={17} />}
                {authMode === "login" ? "Sign in" : "Create account"}
              </button>
            </form>

            <div className="auth-switch">
              {authMode === "login" ? "New to CineBook?" : "Already have an account?"}
              <button
                onClick={() => {
                  setAuthMode(authMode === "login" ? "register" : "login");
                  setMessage("");
                }}
              >
                {authMode === "login" ? "Create account" : "Sign in"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
