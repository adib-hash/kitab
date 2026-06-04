import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

const native = () => Capacitor.isNativePlatform()
const SETTINGS_KEY = 'kitab_notification_settings'

// Default notification settings
const defaultSettings = {
  readingReminder: false,
  readingReminderHour: 20, // 8pm
  readingReminderMinute: 0,
  highlightOfDay: false,
  highlightHour: 9, // 9am
  highlightMinute: 0,
  goalMilestones: true,
  kindleSyncReminder: true,
  bookAnniversary: true,
}

// Notification IDs (stable, so we can cancel/replace)
const IDS = {
  READING_REMINDER: 1001,
  HIGHLIGHT_OF_DAY: 1002,
  KINDLE_SYNC_REMINDER: 1003,
  GOAL_MILESTONE: 1010, // 1010-1013 for 25/50/75/100%
  BOOK_ANNIVERSARY_BASE: 2000, // 2000+ for anniversaries
}

export function getNotificationSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY)
    return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings
  } catch {
    return defaultSettings
  }
}

export function saveNotificationSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

/**
 * Request notification permissions. Returns true if granted.
 */
export async function requestPermission() {
  if (!native()) return false
  try {
    let { display } = await LocalNotifications.checkPermissions()
    if (display === 'prompt' || display === 'prompt-with-rationale') {
      const result = await LocalNotifications.requestPermissions()
      display = result.display
    }
    return display === 'granted'
  } catch {
    return false
  }
}

/**
 * Check if notifications are permitted.
 */
export async function checkPermission() {
  if (!native()) return false
  try {
    const { display } = await LocalNotifications.checkPermissions()
    return display === 'granted'
  } catch {
    return false
  }
}

/**
 * Schedule the daily reading reminder.
 */
export async function scheduleReadingReminder({ bookTitle, currentPage, hour, minute }) {
  if (!native()) return
  try {
    await LocalNotifications.cancel({ notifications: [{ id: IDS.READING_REMINDER }] })

    const body = currentPage
      ? `You're on page ${currentPage} of ${bookTitle}`
      : `Continue reading ${bookTitle}`

    await LocalNotifications.schedule({
      notifications: [{
        id: IDS.READING_REMINDER,
        title: 'Time to read?',
        body,
        schedule: {
          on: { hour, minute },
          repeats: true,
          allowWhileIdle: true,
        },
        sound: 'default',
      }],
    })
  } catch (e) {
    console.warn('Failed to schedule reading reminder:', e)
  }
}

/**
 * Cancel the daily reading reminder.
 */
export async function cancelReadingReminder() {
  if (!native()) return
  try {
    await LocalNotifications.cancel({ notifications: [{ id: IDS.READING_REMINDER }] })
  } catch {}
}

/**
 * Schedule highlight of the day notification.
 * @param {Object} params
 * @param {string} params.text - Highlight text (full, no truncation)
 * @param {string} params.bookTitle - Book title
 * @param {string} [params.highlightId] - Highlight ID for deep linking
 * @param {string} [params.bookId] - Book ID for deep linking
 * @param {number} params.hour - Hour to fire
 * @param {number} params.minute - Minute to fire
 */
export async function scheduleHighlightOfDay({ text, bookTitle, highlightId, bookId, hour, minute }) {
  if (!native()) return
  try {
    await LocalNotifications.cancel({ notifications: [{ id: IDS.HIGHLIGHT_OF_DAY }] })

    await LocalNotifications.schedule({
      notifications: [{
        id: IDS.HIGHLIGHT_OF_DAY,
        title: `From ${bookTitle}`,
        body: text,
        schedule: {
          on: { hour, minute },
          repeats: true,
          allowWhileIdle: true,
        },
        sound: 'default',
        extra: highlightId && bookId ? { highlightId, bookId } : undefined,
      }],
    })
  } catch (e) {
    console.warn('Failed to schedule highlight notification:', e)
  }
}

/**
 * Cancel highlight of the day notification.
 */
export async function cancelHighlightOfDay() {
  if (!native()) return
  try {
    await LocalNotifications.cancel({ notifications: [{ id: IDS.HIGHLIGHT_OF_DAY }] })
  } catch {}
}

/**
 * Check and fire goal milestone notifications.
 */
export async function checkGoalMilestones(current, target) {
  if (!native() || !target || target <= 0) return
  const settings = getNotificationSettings()
  if (!settings.goalMilestones) return

  const percentage = Math.round((current / target) * 100)
  const milestones = [
    { pct: 25, id: IDS.GOAL_MILESTONE, msg: `Quarter of the way there! ${current} of ${target} books read.` },
    { pct: 50, id: IDS.GOAL_MILESTONE + 1, msg: `Halfway! ${current} of ${target} books read.` },
    { pct: 75, id: IDS.GOAL_MILESTONE + 2, msg: `Three quarters done! ${current} of ${target} books read.` },
    { pct: 100, id: IDS.GOAL_MILESTONE + 3, msg: `Goal achieved! You've read ${current} books this year!` },
  ]

  for (const milestone of milestones) {
    const prevKey = `kitab_milestone_${milestone.pct}_${new Date().getFullYear()}`
    if (percentage >= milestone.pct && !localStorage.getItem(prevKey)) {
      localStorage.setItem(prevKey, 'true')
      try {
        await LocalNotifications.schedule({
          notifications: [{
            id: milestone.id,
            title: percentage >= 100 ? 'Reading Goal Complete!' : 'Reading Goal Progress',
            body: milestone.msg,
            schedule: { at: new Date(Date.now() + 1000) },
          }],
        })
      } catch {}
    }
  }
}

/**
 * Schedule Kindle sync reminder — fires at most once every 7 days.
 * Tracks the last send time so repeated app launches don't re-fire it.
 */
export async function scheduleKindleSyncReminder() {
  if (!native()) return
  const settings = getNotificationSettings()
  if (!settings.kindleSyncReminder) return

  const lastSync = localStorage.getItem('kindle_last_sync')
  if (!lastSync) return // Don't remind if they've never synced

  const daysSinceSync = Math.floor((Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60 * 24))
  if (daysSinceSync < 7) {
    await LocalNotifications.cancel({ notifications: [{ id: IDS.KINDLE_SYNC_REMINDER }] }).catch(() => {})
    return
  }

  // Only fire the reminder once every 7 days regardless of how often the app opens
  const lastReminderSent = localStorage.getItem('kindle_sync_reminder_sent_at')
  if (lastReminderSent) {
    const daysSinceReminder = Math.floor((Date.now() - new Date(lastReminderSent).getTime()) / (1000 * 60 * 60 * 24))
    if (daysSinceReminder < 7) return
  }

  try {
    await LocalNotifications.cancel({ notifications: [{ id: IDS.KINDLE_SYNC_REMINDER }] })
    localStorage.setItem('kindle_sync_reminder_sent_at', new Date().toISOString())
    await LocalNotifications.schedule({
      notifications: [{
        id: IDS.KINDLE_SYNC_REMINDER,
        title: 'Kindle Highlights',
        body: "It's been a week since your last Kindle sync.",
        schedule: { at: new Date(Date.now() + 2000) },
      }],
    })
  } catch {}
}

/**
 * Check for book anniversaries and schedule notifications.
 */
export async function checkBookAnniversaries(books) {
  if (!native()) return
  const settings = getNotificationSettings()
  if (!settings.bookAnniversary) return

  const today = new Date()
  const thisMonth = today.getMonth()
  const thisYear = today.getFullYear()

  const anniversaryBooks = books.filter(b => {
    if (!b.date_finished || b.status !== 'read') return false
    const year = parseInt(b.date_finished.slice(0, 4))
    const month = parseInt(b.date_finished.slice(5, 7)) - 1
    return month === thisMonth && year < thisYear
  })

  for (let i = 0; i < Math.min(anniversaryBooks.length, 3); i++) {
    const book = anniversaryBooks[i]
    const yearsAgo = thisYear - parseInt(book.date_finished.slice(0, 4))
    const annivKey = `kitab_anniv_${book.id}_${thisYear}`
    if (localStorage.getItem(annivKey)) continue

    localStorage.setItem(annivKey, 'true')
    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: IDS.BOOK_ANNIVERSARY_BASE + i,
          title: 'Book Anniversary',
          body: `${yearsAgo} year${yearsAgo > 1 ? 's' : ''} ago you finished "${book.title}"`,
          schedule: { at: new Date(Date.now() + 3000 + i * 1000) },
        }],
      })
    } catch {}
  }
}

/**
 * Reschedule all active notifications based on current settings and data.
 * Call on app launch / Dashboard mount.
 */
export async function rescheduleAllNotifications({ books = [], highlights = [], goal = null }) {
  if (!native()) return

  const hasPermission = await checkPermission()
  if (!hasPermission) return

  const settings = getNotificationSettings()
  const thisYear = new Date().getFullYear()

  // Reading reminder
  const currentlyReading = books.find(b => b.status === 'reading')
  if (settings.readingReminder && currentlyReading) {
    await scheduleReadingReminder({
      bookTitle: currentlyReading.title,
      currentPage: currentlyReading.current_page,
      hour: settings.readingReminderHour,
      minute: settings.readingReminderMinute,
    })
  } else {
    await cancelReadingReminder()
  }

  // Highlight of the day — pass IDs so tapping navigates to the book
  if (settings.highlightOfDay && highlights.length > 0) {
    const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % highlights.length
    const h = highlights[dayIndex]
    await scheduleHighlightOfDay({
      text: h.text,
      bookTitle: h.books?.title || 'Your Library',
      highlightId: h.id,
      bookId: h.book_id,
      hour: settings.highlightHour,
      minute: settings.highlightMinute,
    })
  } else {
    await cancelHighlightOfDay()
  }

  // Goal milestones
  if (goal) {
    const booksRead = books.filter(
      b => b.status === 'read' && b.date_finished &&
      parseInt(b.date_finished.slice(0, 4)) === thisYear
    ).length
    await checkGoalMilestones(booksRead, goal.target)
  }

  // Kindle sync reminder (fires at most once per 7 days)
  await scheduleKindleSyncReminder()

  // Book anniversaries
  await checkBookAnniversaries(books)
}
