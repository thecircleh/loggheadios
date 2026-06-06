import React from 'react';

const HowToPage = () => {
  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>Getting Started with Loggerhead.app</h1>

      <section style={styles.section}>
        <h2>Signing Up</h2>
        <p>
          Signing up couldn’t be easier — and it’s free! Just visit{' '}
          <a href="https://ui.loggerhead.app/register" target="_blank" rel="noopener noreferrer" style={styles.link}>
            https://ui.loggerhead.app/register
          </a>{' '}
          and use your email address to set up a password. You're tracking your player's stats, so choose a secure password.
        </p>
        <img src="/register.png" alt="Registration page" style={styles.image} />
        <p>After signing up, you'll be automatically logged in and redirected to your Profile page.</p>
      </section>

      <section style={styles.section}>
        <h2>Setting up your Profile</h2>
        <p>
          Visit your profile at{' '}
          <a href="https://ui.loggerhead.app/profile" target="_blank" rel="noopener noreferrer" style={styles.link}>
            https://ui.loggerhead.app/profile
          </a>. This is where you:
        </p>
        <ul>
          <li>Enter your name and state/region</li>
          <li>List the teams you manage (comma-separated)</li>
        </ul>
        <img src="/profile1.png" alt="Profile form" style={styles.image} />
		<ul>
		<li>Set email preferences</li>
        <li>Change your password</li>
		</ul>
		
        <img src="/profile2.png" alt="Profile preferences" style={styles.image} />
        <img src="/updateSuccess.png" alt="Update confirmation" style={styles.image} />
        <p>Click "Update Profile" — if successful, you're ready to continue!</p>
      </section>

      <section style={styles.section}>
        <h2>Subscribing</h2>
        <p>
          Subscriptions can be started and managed from the Profile page. You'll be redirected to our partner Stripe's secure
          payment portal. Subscriptions renew automatically on your anniversary unless cancelled.
        </p>
        <img src="/subscribe.png" alt="Subscribe button" style={styles.imageSmall} />
        <img src="/manage.png" alt="Manage subscription" style={styles.imageSmall} />
      </section>

      <section style={styles.section}>
        <h2>Setting Up My Roster</h2>
        <p>
          After entering your team name, go to the <strong>Settings</strong> page to add players. Each player has:
        </p>
        <ul>
          <li>A name</li>
          <li>A jersey number</li>
          <li>An optional position</li>
        </ul>
        <img src="/addPlayer.png" alt="Add player form" style={styles.image} />
        <p>If you make a mistake, just click the trash icon to delete that player:</p>
        <img src="/deletePlayer.png" alt="Delete player" style={styles.imageSmall} />
        <h3>HELP! I can’t add a Libero?</h3>
        <p>
          You can — Loggerhead treats Libero as a toggleable role. Flip the switch for up to 2 players and they'll be marked as Libero
          (you can switch them back anytime).
        </p>
        <img src="/isLibero.png" alt="Toggle libero role" style={styles.imageSmall} />
      </section>
	  
	        <section style={styles.section}>
        <h2>Match Settings</h2>
        <p>After entering at least 6 non libero players, you’re ready to configure your match. This is done from the Match Settings form.</p>

        <img src="/matchSettings.png" alt="Match settings form" style={styles.image} />

        <ul>
          <li>
            <strong>Opponent:</strong> Enter the name of the opposing team for this match.
          </li>
          <li>
            <strong>Event:</strong> Optionally enter the tournament or event name (e.g., “Regional Qualifier”).
          </li>
          <li>
            <strong>Location:</strong> Optionally enter the venue or city where the match is taking place.
          </li>
          <li>
            <strong>Max Sets:</strong> The number of sets to be played in the match (e.g., 3 or 5).
          </li>
          <li>
            <strong>Play all sets regardless of outcome:</strong> If checked, all sets will be played to the full number of points even if the match is already decided. Useful for scrimmages or player rotation.
          </li>
          <li>
            <strong>Points/Set:</strong> The number of points required to win a non-deciding set (typically 25).
          </li>
          <li>
            <strong>Deciding Set:</strong> The number of points required to win the final (usually 5th) set (typically 15).
          </li>
        </ul>
		<p>
          A special note about <strong>1 set matches </strong>:  If the match will beplayed to 15, just click Save and Start Match , If it wil be played to 25 click "Play all sets".
        </p>

        <p>
          Once you’ve filled everything out, click <strong>"Save and Start Match"</strong>. This will initialize the court and take you to the live match interface.
        </p>
      </section>
	  
      <section style={styles.section}>
        <h2>Logging the Match</h2>
        <p>Ok, so now that you have your team loaded up and your match saved and running, the fun starts.</p>
        <p>This is the tab where you’ll spend most of your time in Loggerhead.app.</p>
        <p>You’ll start by clicking and dragging your players from the bench into their court positions. Once you’ve moved all six players, it’s time to sub in the Libero — just like a real match. They’ll be the player with a different background color on the bench. Once the Libero is placed, Libero Tracking is automatically enabled — meaning auto substitutions and pairings are in play.</p>
        <video src="/dragging.mp4" muted loop autoPlay style={styles.video} />

        <p>If your team is the first to serve, you're ready. If not, click the orange <strong>Switch Serve</strong> button above the court. This is a free switch that won’t rotate players. If rotation should have occurred, tap the <strong>Rotate Players</strong> button to rotate the lineup in serve order. Finally, if the lineup is completely off, use the <strong>Clear Court</strong> button to reset everything — including Libero tracking.</p>
        <img src="/orange.png" alt="Switch, Rotate, Clear Court buttons" style={styles.imageSmall} />

        <h3>When Your Team is Serving</h3>
        <p>There are three green action buttons under the court:</p>
        <img src="/ourserve.png" alt="Serve buttons" style={styles.imageSmall} />
        <ul>
          <li><strong>Service Ace:</strong> Adds 1 point to your team and keeps serve.</li>
          <li><strong>Service Error:</strong> Adds 1 point to the opponent and passes serve.</li>
          <li><strong>In Play:</strong> No score change — the ball moves to the other side and buttons update.</li>
        </ul>

        <h3>In Play Buttons</h3>
        <p>When the ball is in play across the net, two buttons appear:</p>
        <img src="/inPlay.png" alt="Opponent response options" style={styles.imageSmall} />
        <p>If the ball doesn’t come back, tap <strong>Opponent Error</strong>. If it’s a kill, tap <strong>Opponent Kill</strong>. If the original serve was an Ace, tap <strong>Opponent Ace</strong>.</p>

        <p>All standard scenarios are covered — including when the opponent is serving.</p>
        <img src="/inPlayFull.png" alt="Full in-play options" style={styles.image} />

        <h3>Tracking Touches</h3>
        <p>Click players in the order they touch the ball — up to 3 touches:</p>
        <img src="/touch1.png" alt="Touch 1" style={styles.imageSmall} />
        <img src="/touch2.png" alt="Touch 2" style={styles.imageSmall} />
        <img src="/touch3.png" alt="Touch 3" style={styles.imageSmall} />

        <p>From here, it’s just see, tap, and log. Use the block icons along the top to record block attempts:</p>
        <img src="/block.png" alt="Block buttons" style={styles.imageSmall} />

        <p>If a <strong>free ball</strong> is coming back across the net, tap <strong>Free Ball</strong> before touching the first player. If <em>you</em> send a free ball, tap it after touching the sender.</p>
        <img src="/freeball.png" alt="Free ball toggle" style={styles.publicmall} />

        <p>Keep going — and have fun! When the match ends, tap the <strong>Stats</strong> button up top for a full breakdown. Your reward for logging!</p>

        <p><strong>Happy Logging.</strong></p>
      </section>
    </div>
  );
};

const styles = {
  container: {
    padding: '24px',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    backgroundColor: '#F9F9F9',
    color: '#1C1C1E',
    maxWidth: '800px',
    margin: '0 auto',
  },
  heading: {
    fontSize: '32px',
    fontWeight: '700',
    marginBottom: '20px',
    textAlign: 'center',
  },
  section: {
    marginBottom: '40px',
  },
  link: {
    color: '#007AFF',
    textDecoration: 'none',
    fontWeight: '500',
  },
  image: {
    width: '100%',
    borderRadius: '12px',
    margin: '16px 0',
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
  },
  publicmall: {
    width: '150px',
    borderRadius: '12px',
    margin: '12px 12px 12px 0',
    display: 'inline-block',
    verticalAlign: 'top',
    boxShadow: '0 3px 6px rgba(0,0,0,0.1)',
  },
  video: {
    width: '100%',
    borderRadius: '12px',
    margin: '16px 0',
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
  }
};

export default HowToPage;