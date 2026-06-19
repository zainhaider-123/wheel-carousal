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
let renderBoxes = []

const draggableEl = wrapper.querySelector('.draggable')

let pathLength = 0
let circumference = 0
let currentProgress = 0
let activeTween = null
let arc = null
let autoplayTimer = null
let autoplayPauseCount = 0
let autoplayPaused = false

// ============================================================
// Core carousel maths – driven by the actual number of boxes in the DOM
// ============================================================
// visibleBoxes should match the number of .box elements in your HTML.
const numBoxes = boxes.length || config.visibleBoxes
const numPositions = config.visibleBoxes * 2
const positionStep = 1 / numPositions
const minEnd = 0.5 + positionStep
const angleInDegrees = config.visibleBoxes * config.boxSpacing

// One full marquee cycle is the progress distance after which the box pattern repeats.
const cycleProgress = numBoxes * positionStep / minEnd
const boxAdvance = positionStep / minEnd

// Snap positions are the progress values that center each box at the top of the arc.
const snapValues = []
for (let i = 0; i < numBoxes; i++) {
  let center = (0.5 - i * positionStep) / minEnd
  center = ((center % cycleProgress) + cycleProgress) % cycleProgress
  snapValues.push(center)
}

const snapProgress = snap(snapValues)
const colorForIndex = wrap(config.boxColors)

// ============================================================
// Setup
// ============================================================
console.clear()
console.log('Carousel config:', config)
console.log('Boxes found:', numBoxes)

computeArc(numPositions)
initBoxes()
buildRenderBoxes()

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
  })
}

// ============================================================
// Carousel rendering – replaces MotionPathPlugin
// ============================================================
function renderCarousel(progress) {
  if (!arc) return

  renderBoxes.forEach((item) => {
    const i = item.originalIndex
    const box = item.element
    const effectiveProgress = progress + item.offset
    const start = i * positionStep
    const pathProgress = start + effectiveProgress * minEnd

    // Only render instances that fall on the visible arc.
    if (pathProgress < 0 || pathProgress > 1) {
      box.style.display = 'none'
      return
    }

    box.style.display = 'block'

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
  return ((p % cycleProgress) + cycleProgress) % cycleProgress
}

function wrapProgress(progress) {
  return ((progress % cycleProgress) + cycleProgress) % cycleProgress
}

function moveToProgress(progress, direction = 0) {
  collapse()

  let target = progress
  if (config.loop) {
    target = wrapProgress(progress)
  } else {
    target = clamp(progress, 0, cycleProgress)
  }
  target = snapProgress(target)

  if (activeTween) activeTween.stop()

  let from = currentProgress
  let to = target

  // When looping, animate across the cycle boundary in the requested direction
  // instead of snapping backwards.
  if (config.loop) {
    const diff = target - from
    if (direction > 0 && diff < 0) {
      to = target + cycleProgress
    } else if (direction < 0 && diff > 0) {
      to = target - cycleProgress
    }
  }

  pauseAutoplay()
  activeTween = tween({
    from,
    to,
    duration: config.animationDurationMs,
    ease: config.useBackEase ? easeOutBack : (t) => t,
    onUpdate: (p) => {
      currentProgress = p
      renderCarousel(p)
    },
    onComplete: () => {
      if (config.loop) {
        currentProgress = wrapProgress(currentProgress)
        renderCarousel(currentProgress)
      }
      resumeAutoplay()
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
// Marquee instances – duplicate boxes so the loop appears seamless
// ============================================================
function buildRenderBoxes() {
  renderBoxes = []
  // Offsets of -1, 0, +1 cycles are enough to cover the visible arc during rotation.
  const cycleOffsets = config.loop ? [-cycleProgress, 0, cycleProgress] : [0]

  cycleOffsets.forEach((offset) => {
    boxes.forEach((box, i) => {
      const el = offset === 0 ? box : box.cloneNode(true)
      if (offset !== 0) {
        el.style.backgroundColor = colorForIndex(i)
        el.style.transformOrigin = '50% 50%'
        draggableEl.appendChild(el)
      }

      el.addEventListener('mouseenter', () => {
        boxStates[i].hovered = true
        renderCarousel(currentProgress)
        if (config.pauseAutoplayOnHover) pauseAutoplay()
      })

      el.addEventListener('mouseleave', () => {
        boxStates[i].hovered = false
        renderCarousel(currentProgress)
        if (config.pauseAutoplayOnHover) resumeAutoplay()
      })

      el.addEventListener('click', () => {
        collapse(i)
        activateBox(i)
        moveToProgress(snapValues[i])
      })

      renderBoxes.push({ element: el, originalIndex: i, offset })
    })
  })
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
      nextProgress = wrapProgress(nextProgress)
    } else {
      nextProgress = clamp(nextProgress, 0, cycleProgress)
      if (nextProgress <= 0 || nextProgress >= cycleProgress) {
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
  autoplayPauseCount++
  autoplayPaused = autoplayPauseCount > 0
}

function resumeAutoplay() {
  autoplayPauseCount = Math.max(0, autoplayPauseCount - 1)
  autoplayPaused = autoplayPauseCount > 0
}

// ============================================================
// Draggable – replaces GSAP Draggable + InertiaPlugin
// ============================================================
function createDraggable() {
  const minProgress = 0
  const maxProgress = cycleProgress
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
    if (config.loop) {
      p = wrapProgress(p)
    } else {
      p = clamp(p, minProgress, maxProgress)
    }
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
    moveToProgress(currentProgress + boxAdvance, 1)
  })

  next.addEventListener('click', () => {
    moveToProgress(currentProgress - boxAdvance, -1)
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
