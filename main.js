// Wheel carousel – pure vanilla JavaScript, no external libraries/CDNs.
// Replicates the GSAP MotionPath + Draggable behavior from the original main.js.

// ============================================================
// CONFIGURATION – tweak the carousel here
// ============================================================
const config = {
  boxColors: ['#f38630', '#6fb936', '#ccc', '#6fb936'],
  activeColor: '#ff0000',

  pathRadius: 2560,
  pathTopOffset: 300,

  // Carousel geometry. Set visibleBoxes to match the number of .box elements in HTML.
  visibleBoxes: 7,   // how many boxes span the visible arc
  boxSpacing: 17,    // degrees between adjacent boxes

  normalScale: 1,
  hoverScale: 1,
  activeScale: 1,

  animationDurationMs: 600,
  useBackEase: true,

  showOverflow: false,

  loop: true,
  autoplay: true,
  marqueeSpeed: 0.02,   // progress units per second; positive/negative sets direction
  pauseAutoplayOnHover: true,
  pauseAutoplayOnDrag: true
}

// ============================================================
// Utility helpers (replacing gsap.utils.*)
// ============================================================
function toArray(selector, context = document) {
  return Array.from(context.querySelectorAll(selector))
}

function wrap(arr) {
  return (i) => arr[((i % arr.length) + arr.length) % arr.length]
}

function normalize(min, max) {
  return (value) => (value - min) / (max - min)
}

function snap(values) {
  return (value) => {
    let closest = values[0]
    values.forEach((v) => {
      if (Math.abs(v - value) < Math.abs(closest - value)) closest = v
    })
    return closest
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function easeOutBack(t) {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

// ============================================================
// Tiny tween engine (replaces gsap.to / gsap.timeline)
// ============================================================
function tween({ from, to, duration, ease = (t) => t, onUpdate, onComplete }) {
  const start = performance.now()
  let rafId

  function update(now) {
    const elapsed = now - start
    const t = Math.min(elapsed / duration, 1)
    const eased = ease(t)
    const value = from + (to - from) * eased

    onUpdate(value)

    if (t < 1) {
      rafId = requestAnimationFrame(update)
    } else if (onComplete) {
      onComplete()
    }
  }

  rafId = requestAnimationFrame(update)

  return {
    stop() {
      cancelAnimationFrame(rafId)
    }
  }
}

// ============================================================
// DOM refs & state
// ============================================================
const wrapper = document.querySelector('.wrapper')

// Use the boxes already present in the HTML.
let boxes = toArray('.box', wrapper)
let boxStates = boxes.map(() => ({ hovered: false, active: false }))

let pathLength = 0
let circumference = 0
let currentProgress = 0
let activeTween = null
let arc = null
let autoplayTimer = null
let autoplayPaused = false

// ============================================================
// Core carousel maths – driven by the actual number of boxes in the DOM
// ============================================================
// visibleBoxes should match the number of .box elements in your HTML.
const numBoxes = boxes.length || config.visibleBoxes
const boxStep = 1 / (numBoxes + 1)
const numPositions = config.visibleBoxes * 2
const positionStep = 1 / numPositions
const minEnd = 0.5 + positionStep
const angleInDegrees = config.visibleBoxes * config.boxSpacing

const snapValues = []
for (let i = 1; i <= numBoxes; i++) {
  snapValues.push(i * boxStep)
}

const snapProgress = snap(snapValues)
const normalizeProgress = normalize(1, 0)
const colorForIndex = wrap(config.boxColors)

// ============================================================
// Setup
// ============================================================
console.clear()
console.log('Carousel config:', config)
console.log('Boxes found:', numBoxes)

computeArc(numPositions)
initBoxes()

if (numBoxes > 1) {
  currentProgress = calculateInitialProgress()
  createDraggable()
  createControls()
  applyToggles()
  renderCarousel(currentProgress)
  startAutoplay()
  window.addEventListener('resize', () => {
    computeArc(numPositions)
    renderCarousel(currentProgress)
  })
} else {
  currentProgress = 0.5
  renderCarousel(currentProgress)
}

// ============================================================
// Box styling & events
// ============================================================
function initBoxes() {
  boxes.forEach((box, i) => {
    box.style.backgroundColor = colorForIndex(i)
    box.style.transformOrigin = '50% 50%'

    box.addEventListener('mouseenter', () => {
      boxStates[i].hovered = true
      renderCarousel(currentProgress)
      if (config.pauseAutoplayOnHover) pauseAutoplay()
    })

    box.addEventListener('mouseleave', () => {
      boxStates[i].hovered = false
      renderCarousel(currentProgress)
      if (config.pauseAutoplayOnHover) resumeAutoplay()
    })

    box.addEventListener('click', () => {
      collapse(i)
      activateBox(i)
      const targetProgress = normalizeProgress(snapValues[i])
      moveToProgress(targetProgress)
    })
  })
}

// ============================================================
// Carousel rendering – replaces MotionPathPlugin
// ============================================================
function renderCarousel(progress) {
  if (!arc) return

  boxes.forEach((box, i) => {
    const start = i * positionStep
    const end = minEnd + i * positionStep
    const pathProgress = clamp(start + progress * (end - start), 0, 1)

    const angleRad = arc.startAngle + pathProgress * (arc.endAngle - arc.startAngle)
    const p = {
      x: arc.centerX + arc.radius * Math.cos(angleRad),
      y: arc.centerY + arc.radius * Math.sin(angleRad)
    }

    // Tangent angle for this point on the circle.
    const angleDeg = angleRad * (180 / Math.PI) + 90

    const state = boxStates[i]
    let scale = config.normalScale
    if (state.active) scale = config.activeScale
    else if (state.hovered) scale = config.hoverScale

    const bg = state.active ? config.activeColor : colorForIndex(i)

    const x = p.x - box.offsetWidth / 2
    const y = p.y - box.offsetHeight / 2

    // z-index based on y gives natural depth (lower y = further back).
    box.style.zIndex = Math.round(p.y)
    box.style.backgroundColor = bg
    box.style.transform = `translate(${x}px, ${y}px) rotate(${angleDeg}deg) scale(${scale})`
  })
}

// ============================================================
// Animation helpers
// ============================================================
function calculateInitialProgress() {
  // Center the middle box horizontally at the top of the arc.
  const middleIndex = Math.floor((numBoxes - 1) / 2)
  let p = (0.5 - middleIndex * positionStep) / minEnd
  if (numBoxes < 5) p = 0.5 / minEnd
  return clamp(p, positionStep, 1 - positionStep)
}

function wrapProgress(progress) {
  const min = positionStep
  const max = 1 - positionStep
  const range = max - min
  return ((progress - min) % range + range) % range + min
}

function moveToProgress(progress) {
  collapse()

  let target = progress
  if (config.loop) {
    target = wrapProgress(progress)
  } else {
    target = clamp(progress, positionStep, 1 - positionStep)
  }
  target = snapProgress(target)

  if (activeTween) activeTween.stop()

  activeTween = tween({
    from: currentProgress,
    to: target,
    duration: config.animationDurationMs,
    ease: config.useBackEase ? easeOutBack : (t) => t,
    onUpdate: (p) => {
      currentProgress = p
      renderCarousel(p)
    }
  })
}

function collapse(except = null) {
  boxes.forEach((_, i) => {
    if (i !== except && boxStates[i].active) {
      boxStates[i].active = false
    }
  })
  renderCarousel(currentProgress)
}

function activateBox(i) {
  boxStates[i].active = true
  renderCarousel(currentProgress)
}

// ============================================================
// Autoplay
// ============================================================
function startAutoplay() {
  if (!config.autoplay || numBoxes <= 1) return
  stopAutoplay()
  autoplayPaused = false
  let lastTime = performance.now()

  function tick(now) {
    if (autoplayPaused) {
      lastTime = now
      autoplayTimer = requestAnimationFrame(tick)
      return
    }

    const dt = (now - lastTime) / 1000
    lastTime = now

    let nextProgress = currentProgress + config.marqueeSpeed * dt

    if (config.loop) {
      nextProgress = ((nextProgress % 1) + 1) % 1
    } else {
      nextProgress = clamp(nextProgress, positionStep, 1 - positionStep)
      if (nextProgress <= positionStep || nextProgress >= 1 - positionStep) {
        stopAutoplay()
        return
      }
    }

    currentProgress = nextProgress
    renderCarousel(currentProgress)
    autoplayTimer = requestAnimationFrame(tick)
  }

  autoplayTimer = requestAnimationFrame(tick)
}

function stopAutoplay() {
  if (autoplayTimer) {
    cancelAnimationFrame(autoplayTimer)
    autoplayTimer = null
  }
}

function pauseAutoplay() {
  autoplayPaused = true
}

function resumeAutoplay() {
  autoplayPaused = false
}

// ============================================================
// Draggable – replaces GSAP Draggable + InertiaPlugin
// ============================================================
function createDraggable() {
  const minProgress = positionStep
  const maxProgress = 1 - positionStep
  circumference = pathLength / 1.5

  let isDragging = false
  let startX = 0
  let startProgress = 0

  wrapper.addEventListener('pointerdown', (e) => {
    isDragging = true
    startX = e.clientX
    startProgress = currentProgress
    wrapper.classList.add('dragging')
    collapse()
    if (activeTween) activeTween.stop()
    if (config.pauseAutoplayOnDrag) pauseAutoplay()
  })

  window.addEventListener('pointermove', (e) => {
    if (!isDragging) return
    const dx = e.clientX - startX
    let p = startProgress + dx / circumference
    p = clamp(p, minProgress, maxProgress)
    currentProgress = p
    renderCarousel(p)
  })

  window.addEventListener('pointerup', () => {
    if (!isDragging) return
    isDragging = false
    wrapper.classList.remove('dragging')
    moveToProgress(currentProgress)
    if (config.pauseAutoplayOnDrag) resumeAutoplay()
  })

  window.addEventListener('pointercancel', () => {
    if (!isDragging) return
    isDragging = false
    wrapper.classList.remove('dragging')
    moveToProgress(currentProgress)
    if (config.pauseAutoplayOnDrag) resumeAutoplay()
  })
}

// ============================================================
// Controls
// ============================================================
function createControls() {
  const prev = document.getElementById('prev')
  const next = document.getElementById('next')

  prev.addEventListener('click', () => {
    moveToProgress(currentProgress + boxStep)
  })

  next.addEventListener('click', () => {
    moveToProgress(currentProgress - boxStep)
  })

  const overflow = document.getElementById('overflow')
  if (overflow) overflow.addEventListener('change', applyToggles)
}

function applyToggles() {
  const overflow = document.getElementById('overflow')
  wrapper.classList.toggle('show-overflow', overflow ? overflow.checked : config.showOverflow)
}

// ============================================================
// Arc geometry – no SVG element needed
// ============================================================
function computeArc(numPositions) {
  const wrapperRect = wrapper.getBoundingClientRect()
  const angleInRadians = angleInDegrees * (Math.PI / 180)

  // Center the arc horizontally within the wrapper and keep the top of the arc
  // near the configured offset so the carousel sits nicely on screen.
  const radius = config.pathRadius
  const centerX = wrapperRect.width / 2
  const centerY = radius + config.pathTopOffset

  const startAngleInRadians = -Math.PI / 2 - angleInRadians / 2
  const endAngleInRadians = -Math.PI / 2 + angleInRadians / 2

  arc = {
    radius,
    centerX,
    centerY,
    startAngle: startAngleInRadians,
    endAngle: endAngleInRadians
  }

  pathLength = radius * Math.abs(endAngleInRadians - startAngleInRadians)
}
