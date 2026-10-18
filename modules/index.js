// modules/index.js
//
// The Nakama runtime for the Mavins gamification boards.
//
// WHY THIS EXISTS. The four boards the app reads and writes —
// artist_total_streams, artist_weekly_growth, artist_monthly_growth and
// campaign_streams — do not exist on the live server. Every read returns
// `404 {"code":5,"message":"Leaderboard not found."}`. Only
// `earnings_leaderboard`, `earnings_leaderboard_week` and
// `earnings_leaderboard_month` exist, from an earlier runtime.
//
// There is no HTTP endpoint that creates a leaderboard: `PUT
// /v2/leaderboard/{id}` answers `501 Method Not Allowed` and `POST
// /v2/leaderboard` answers `404`. A board is declared from the runtime, which
// is what `InitModule` below does. `leaderboardCreate` is idempotent, so a
// redeploy is safe and every boot after the first logs "already present".
//
// WHY THERE IS ALSO AN RPC. The app used to write scores with the server key
// as basic auth against `POST /v2/leaderboard/{id}`. That does not work on
// this deployment: the server key is accepted only by the authentication
// routes, while every authenticated API answers
// `401 {"code":16,"message":"Auth token invalid"}` — including reads.
//
// The channel that does work server-to-server is an RPC called with the HTTP
// key, which is proven working (`POST /v2/rpc/health?http_key=...` returns
// 200). So `sync_leaderboards` below is the write path: the app posts a batch
// of owner_id/score/metadata and the runtime performs the privileged
// `leaderboardRecordWrite` itself.
//
// IDENTITY. `owner_id` is the caller's Supabase Auth id and is stored as-is.
// Nakama does not mint an identity for it, and does not need to: a record
// write stores whatever owner id it is given and never looks the owner up in
// the user table (Nakama 3.22.0, `core_leaderboard.go` — the only caller
// check is `leaderboard.Authoritative && caller != uuid.Nil`). So a score for
// a Supabase user exists with no Nakama user behind it, which is the point:
// the app's identity is the only identity.
//
// This is also why `authenticateCustom` is not used anywhere. It would derive
// a Nakama-generated uid and keep the Supabase id beside it as a custom id,
// creating exactly the duplicate identity this design avoids.
//
// The board specs must match `LEADERBOARDS` in the app's
// `src/services/nakama/nakamaServer.ts`: descending order, `best` operator,
// and NOT authoritative. Authoritative must stay false — the app writes
// scores for owners other than the caller, and an authoritative board refuses
// that with `403 {"code":7,"message":"Leaderboard only allows authoritative
// score submissions."}`.

// Kept so the existing keepalive keeps working.
function healthRpc(ctx, logger, nk, payload) {
  return JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() });
}

// Mirrors LEADERBOARDS in the app's nakamaServer.ts.
var BOARDS = [
  { id: 'artist_total_streams', sort: 'desc', operator: 'best', authoritative: false },
  { id: 'artist_weekly_growth', sort: 'desc', operator: 'best', authoritative: false },
  { id: 'artist_monthly_growth', sort: 'desc', operator: 'best', authoritative: false },
  { id: 'campaign_streams', sort: 'desc', operator: 'best', authoritative: false },
];

var BOARD_IDS = BOARDS.map(function (b) { return b.id; });

// Nakama parses owner_id as a uuid on the way in (`uuid.Must(uuid.FromString(ownerID))`),
// so a malformed id panics inside the write rather than failing the one row.
// A batch is written in one call, so that would take the whole board's sync
// down. Checking here turns a bad row into a `failed` count instead.
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Write a batch of records for one board.
 *
 * payload: { "board": "artist_total_streams",
 *            "records": [ { "owner_id": "...", "score": 123,
 *                           "username": "...", "metadata": {} } ] }
 *
 * Returns { board, written, failed }.
 *
 * `metadata` must be a JSON *string* at the Nakama layer — an object is
 * rejected before routing with
 * `400 proto: invalid value for string type: {`. Callers pass a normal
 * object and it is stringified here.
 */
function syncLeaderboardsRpc(ctx, logger, nk, payload) {
  var data = {};
  try {
    data = JSON.parse(payload || '{}');
  } catch (e) {
    return JSON.stringify({ error: 'payload is not valid JSON' });
  }

  var board = data.board;
  if (BOARD_IDS.indexOf(board) === -1) {
    return JSON.stringify({
      error: 'unknown board',
      board: board,
      known: BOARD_IDS,
    });
  }

  var records = data.records || [];
  var written = 0;
  var failed = 0;

  records.forEach(function (r) {
    if (!r || !r.owner_id || !UUID_RE.test(String(r.owner_id))) {
      failed += 1;
      return;
    }
    var metadata = null;
    if (r.metadata) {
      metadata =
        typeof r.metadata === 'string' ? r.metadata : JSON.stringify(r.metadata);
    }
    try {
      // owner_id is the Supabase uid and is stored as given. No Nakama user
      // needs to exist for it — see the IDENTITY note above.
      nk.leaderboardRecordWrite(
        board,
        r.owner_id,
        r.username || null,
        Math.max(0, Math.floor(Number(r.score) || 0)),
        0,
        metadata
      );
      written += 1;
    } catch (e) {
      failed += 1;
      logger.warn('leaderboard write failed for ' + r.owner_id + ': ' + e);
    }
  });

  return JSON.stringify({
    board: board,
    written: written,
    failed: failed,
  });
}

/** Report which boards this runtime declares. */
function leaderboardsRpc(ctx, logger, nk, payload) {
  return JSON.stringify({ boards: BOARD_IDS });
}

function InitModule(ctx, logger, nk, initializer) {
  logger.info('Nakama runtime initialized.');

  initializer.registerRpc('health', healthRpc);
  initializer.registerRpc('sync_leaderboards', syncLeaderboardsRpc);
  initializer.registerRpc('leaderboards', leaderboardsRpc);

  BOARDS.forEach(function (b) {
    try {
      nk.leaderboardCreate(b.id, b.authoritative, b.sort, b.operator, null);
      logger.info('leaderboard ready: ' + b.id);
    } catch (e) {
      // A board that already exists raises here. That is the normal path on
      // every boot after the first, not a failure.
      logger.info('leaderboard ' + b.id + ' already present: ' + e);
    }
  });
}
