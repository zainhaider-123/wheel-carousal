// Wheel carousel – pure vanilla JavaScript, no external libraries/CDNs.
// Replicates the GSAP MotionPath + Draggable behavior from the original main.js.

// ============================================================
// CONFIGURATION – tweak the carousel here
// ============================================================
const config = {
  boxColors: ['#f38630', '#6fb936', '#ccc', '#6fb936'],
  activeColor: '#ff0000',

  pathRadius: 1280,
  positionAngleInDegrees: 8,
  pathTopOffset: 300,

  normalScale: 1,
  hoverScale: 1,
  activeScale: 1,

  animationDurationMs: 600,
  useBackEase: true,

  showOverflow: false
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

// ============================================================
// Core carousel maths – driven by the actual number of boxes in the DOM
// ============================================================
const numBoxes = boxes.length
const boxStep = 1 / (numBoxes + 1)
const numPositions = numBoxes * 2
const positionStep = 1 / numPositions
const minEnd = 0.5 + positionStep

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
    })

    box.addEventListener('mouseleave', () => {
      boxStates[i].hovered = false
      renderCarousel(currentProgress)
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

function moveToProgress(progress) {
  collapse()

  const target = snapProgress(progress)

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
  })

  window.addEventListener('pointercancel', () => {
    if (!isDragging) return
    isDragging = false
    wrapper.classList.remove('dragging')
    moveToProgress(currentProgress)
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
  const angleInDegrees = numPositions * config.positionAngleInDegrees
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
