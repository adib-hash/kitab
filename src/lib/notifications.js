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
 * @param {Object} params
 * @param {string} params.bookTitle - Currently reading book title
 * @param {number} params.currentPage - Current page
 * @param {number} params.hour - Hour to fire (0-23)
 * @param {number} params.minute - Minute to fire (0-59)
 */
export async function scheduleReadingReminder({ bookTitle, currentPage, hour, minute }) {
  if (!native()) return
  try {
    // Cancel existing
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
 * @param {string} params.text - Highlight text
 * @param {string} params.bookTitle - Book title
 * @param {number} params.hour - Hour to fire
 * @param {number} params.minute - Minute to fire
 */
export async function scheduleHighlightOfDay({ text, bookTitle, hour, minute }) {
  if (!native()) return
  try {
    await LocalNotifications.cancel({ notifications: [{ id: IDS.HIGHLIGHT_OF_DAY }] })

    // Truncate long highlights for notification body
    const truncated = text.length > 200 ? text.slice(0, 197) + '…' : text

    await LocalNotifications.schedule({
      notifications: [{
        id: IDS.HIGHLIGHT_OF_DAY,
        title: `From ${bookTitle}`,
        body: truncated,
        schedule: {
          on: { hour, minute },
          repeats: true,
          allowWhileIdle: true,
        },
        sound: 'default',
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
 * @param {number} current - Books read this year
 * @param {number} target - Goal target
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
    // Check if we just crossed this milestone
    const prevKey = `kitab_milestone_${milestone.pct}_${new Date().getFullYear()}`
    if (percentage >= milestone.pct && !localStorage.getItem(prevKey)) {
      localStorage.setItem(prevKey, 'true')
      try {
        await LocalNotifications.schedule({
          notifications: [{
            id: milestone.id,
            title: percentage >= 100 ? 'Reading Goal Complete!' : 'Reading Goal Progress',
            body: milestone.msg,
            schedule: { at: new Date(Date.now() + 1000) }, // fire in 1 second
          }],
        })
      } catch {}
    }
  }
}

/**
 * Schedule Kindle sync reminder (weekly check).
 */
export async function scheduleKindleSyncReminder() {
  if (!native()) return
  const settings = getNotificationSettings()
  if (!settings.kindleSyncReminder) return

  const lastSync = localStorage.getItem('kindle_last_sync')
  if (!lastSync) return // Don't remind if they've never synced

  const daysSince = Math.floor((Date.now() - new Date(lastSync).getTime()) / (1000 * 60 * 60 * 24))
  if (daysSince < 7) {
    // Cancel any existing reminder
    await LocalNotifications.cancel({ notifications: [{ id: IDS.KINDLE_SYNC_REMINDER }] }).catch(() => {})
    return
  }

  try {
    await LocalNotifications.cancel({ notifications: [{ id: IDS.KINDLE_SYNC_REMINDER }] })
    await LocalNotifications.schedule({
      notifications: [{
        id: IDS.KINDLE_SYNC_REMINDER,
        title: 'Kindle Highlights',
        body: "It's been a week since your last Kindle sync.",
        schedule: { at: new Date(Date.now() + 2000) }, // fire shortly
      }],
    })
  } catch {}
}

/**
 * Check for book anniversaries and schedule notifications.
 * @param {Array} books - All books from library
 */
export async function checkBookAnniversaries(books) {
  if (!native()) return
  const settings = getNotificationSettings()
  if (!settings.bookAnniversary) return

  const today = new Date()
  const thisMonth = today.getMonth() // 0-indexed
  const thisYear = today.getFullYear()

  const anniversaryBooks = books.filter(b => {
    if (!b.date_finished || b.status !== 'read') return false
    const year = parseInt(b.date_finished.slice(0, 4))
    const month = parseInt(b.date_finished.slice(5, 7)) - 1 // 0-indexed
    // Same month, at least 1 year ago
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

  // Highlight of the day
  if (settings.highlightOfDay && highlights.length > 0) {
    const dayIndex = Math.floor(Date.now() / (1000 * 60 * 60 * 24)) % highlights.length
    const h = highlights[dayIndex]
    await scheduleHighlightOfDay({
      text: h.text,
      bookTitle: h.books?.title || 'Your Library',
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

  // Kindle sync reminder
  await scheduleKindleSyncReminder()

  // Book anniversaries
  await checkBookAnniversaries(books)
}
