
const EPS = 1e-7
const NEAR_CLIPPING_PLANE = 1.0
const FOV = Math.PI / 2
const SCREEN_WIDTH = 800 // count of rays
const PLAYER_STEP_LEN = 0.5
const CAMERA_SENSITIVITY = 0.3

class Vector2 {
  x: number
  y: number

  constructor(x: number, y: number) {
    this.x = x
    this.y = y
  }

  static zero(): Vector2 {
    return new Vector2(0, 0)
  }

  static fromAngle(angle: number): Vector2 {
    return new Vector2(Math.cos(angle), Math.sin(angle))
  }

  add(that: Vector2): Vector2 {
    return new Vector2(this.x + that.x, this.y + that.y)
  }

  sub(that: Vector2): Vector2 {
    return new Vector2(this.x - that.x, this.y - that.y)
  }

  mul(that: Vector2): Vector2 {
    return new Vector2(this.x * that.x, this.y * that.y)
  }

  div(that: Vector2): Vector2 {
    return new Vector2(this.x / that.x, this.y / that.y)
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y)
  }

  norm(): Vector2 {
    const len = this.length()
    if (len == 0) return Vector2.zero()
    return new Vector2(this.x / len, this.y / len)
  }

  scale(value: number): Vector2 {
    return new Vector2(this.x * value, this.y * value)
  }

  rot90(): Vector2 {
    return new Vector2(-this.y, this.x)
  }

  distanceTo(that: Vector2): number {
    return that.sub(this).length()
  }

  lerp(that: Vector2, alpha: number): Vector2 {
    return that.sub(this).scale(alpha).add(this)
  }

  dot(that: Vector2): number {
    return this.x * that.x + this.y * that.y
  }

  array(): [number, number] {
    return [this.x, this.y]
  }
}

class Player {
  position: Vector2
  direction: number

  constructor(position: Vector2, direction: number) {
    this.position = position
    this.direction = direction
  }

  fovRange(): [Vector2, Vector2] {
    const len = Math.tan(FOV * 0.5) * NEAR_CLIPPING_PLANE
    const p = this.position.add(Vector2.fromAngle(this.direction).scale(NEAR_CLIPPING_PLANE))
    const p1 = p.sub(p.sub(this.position).rot90().norm().scale(len))
    const p2 = p.add(p.sub(this.position).rot90().norm().scale(len))

    return [p1, p2]
  }
}

type Scene = Array<Array<string | null>>

function canvasSize(ctx: CanvasRenderingContext2D): Vector2 {
  return new Vector2(ctx.canvas.width, ctx.canvas.height)
}

function fillCircle(ctx: CanvasRenderingContext2D, center: Vector2, radius: number) {
  ctx.beginPath()
  ctx.arc(...center.array(), radius, 0, 2 * Math.PI)
  ctx.fill()
}

function strokeLine(ctx: CanvasRenderingContext2D, p1: Vector2, p2: Vector2) {
  ctx.beginPath()
  ctx.moveTo(...p1.array())
  ctx.lineTo(...p2.array())
  ctx.stroke()
}

function snap(x: number, dx: number): number {
  if (dx > 0)
    return Math.ceil(x + EPS)
  if (dx < 0)
    return Math.floor(x - EPS)
  return x
}

function hittingCell(p1: Vector2, p2: Vector2): Vector2 {
  const d = p2.sub(p1)
  return new Vector2(
    Math.floor(p2.x + Math.sign(d.x) * EPS),
    Math.floor(p2.y + Math.sign(d.y) * EPS)
  )
}

function rayStep(p1: Vector2, p2: Vector2): Vector2 {
  // y = k*x + c
  // x = (y - c)/k
  //
  // | y1 = k*x1 + c
  // | y2 = k*x2 + c
  // 
  // dy = y2 - y1
  // dx = x2 - x1
  // c = y1 - k*x1
  // k = dy/dx
  let p3 = p2
  const d = p2.sub(p1)
  if (d.x !== 0) {
    const k = d.y / d.x
    const c = p1.y - k * p1.x
    {
      const x3 = snap(p2.x, d.x)
      const y3 = k * x3 + c
      p3 = new Vector2(x3, y3)
    }
    if (k !== 0) {
      const y3 = snap(p2.y, d.y)
      const x3 = (y3 - c) / k
      const p3t = new Vector2(x3, y3)
      if (p2.distanceTo(p3) > p2.distanceTo(p3t))
        p3 = p3t
    }
  } else {
    const y3 = snap(p2.y, d.y)
    const x3 = p2.x
    p3 = new Vector2(x3, y3)
  }

  return p3
}

function insideScene(scene: Scene, p: Vector2): boolean {
  const size = sceneSize(scene)
  return p.x >= 0 && p.x < size.x &&
    p.y >= 0 && p.y < size.y
}

function castRay(scene: Scene, p1: Vector2, p2: Vector2): Vector2 {
  while (true) {
    const c = hittingCell(p1, p2)
    if (!insideScene(scene, c) || scene[c.y][c.x] !== null)
      break
    const p3 = rayStep(p1, p2)
    p1 = p2;
    p2 = p3;
  }
  return p2;
}

function distancePointToLine(p1: Vector2, p2: Vector2, p0: Vector2) {
  const A = p2.y - p1.y
  const B = p1.x - p2.x
  const C = p2.x * p1.y - p1.x * p2.y

  return Math.abs((A * p0.x + B * p0.y + C) / Math.sqrt(A ** 2 + B ** 2))
}

function sceneSize(scene: Scene): Vector2 {
  const y = scene.length
  let x = Number.MIN_VALUE;

  for (let row of scene) {
    x = Math.max(x, row.length)
  }
  return new Vector2(x, y)
}

function renderMinimap(
  ctx: CanvasRenderingContext2D,
  player: Player,
  position: Vector2,
  size: Vector2,
  scene: Scene
) {
  ctx.save()

  const gridSize = sceneSize(scene)

  ctx.translate(...position.array())
  ctx.scale(...size.div(gridSize).array())

  ctx.fillStyle = "#181818"
  ctx.fillRect(0, 0, ...gridSize.array())

  ctx.lineWidth = 0.06
  for (let y = 0; y < gridSize.y; y++) {
    for (let x = 0; x < gridSize.x; x++) {
      const color = scene[y][x]
      if (color !== null) {
        ctx.fillStyle = color
        ctx.fillRect(x, y, 1, 1)
      }
    }
  }

  ctx.strokeStyle = "#303030"
  for (let x = 0; x <= gridSize.x; x++)
    strokeLine(ctx, new Vector2(x, 0), new Vector2(x, gridSize.y))

  for (let y = 0; y <= gridSize.y; y++)
    strokeLine(ctx, new Vector2(0, y), new Vector2(gridSize.x, y))

  ctx.fillStyle = "magenta"
  fillCircle(ctx, player.position, 0.2)

  ctx.strokeStyle = "magenta"
  const [p1, p2] = player.fovRange()

  strokeLine(ctx, player.position, p1)
  strokeLine(ctx, player.position, p2)
  strokeLine(ctx, p1, p2)
  // if (p2 !== undefined) {
  //   while (true) {
  //     fillCircle(ctx, p2, 0.1)
  //     strokeLine(ctx, p1, p2)

  //     const c = hittingCell(p1, p2)
  //     if (
  //       c.x < 0 || c.x >= gridSize.x ||
  //       c.y < 0 || c.y >= gridSize.y ||
  //       scene[c.y][c.x] !== 0
  //     )
  //       break

  //     const p3 = rayStep(p1, p2)
  //     p1 = p2
  //     p2 = p3
  //   }
  // }

  ctx.restore()
}

function renderScene(ctx: CanvasRenderingContext2D, player: Player, scene: Scene) {
  const stripWidth = Math.ceil(ctx.canvas.width / SCREEN_WIDTH)
  const [r1, r2] = player.fovRange();

  for (let x = 0; x < SCREEN_WIDTH; x++) {
    const p = castRay(scene, player.position, r1.lerp(r2, x / SCREEN_WIDTH))
    const c = hittingCell(player.position, p)
    if (insideScene(scene, c)) {
      const color = scene[c.y][c.x]
      if (color !== null) {
        const v = p.sub(player.position)
        const d = Vector2.fromAngle(player.direction)
        const stripHeight = ctx.canvas.height / v.dot(d)// distancePointToLine(r1,r2,p)
        ctx.fillStyle = color
        ctx.fillRect(x * stripWidth, (ctx.canvas.height - stripHeight) / 2, stripWidth + 1, stripHeight)
      }
    }
  }
}

function renderGame(ctx: CanvasRenderingContext2D, player: Player, scene: Scene) {
  const minimapPosition = canvasSize(ctx).scale(0.03)
  const cellSize = ctx.canvas.width * 0.03
  const minimapSize = sceneSize(scene).scale(cellSize)

  ctx.fillStyle = "#181818"
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  renderScene(ctx, player, scene)
  renderMinimap(ctx, player, minimapPosition, minimapSize, scene)
}

const game = document.getElementById('game') as (HTMLCanvasElement | null);
if (game === null)
  throw new Error("No canvas with id `game` is found")

const factor = 80
game.width = 16 * factor
game.height = 9 * factor

const ctx = game.getContext("2d")
if (ctx === null)
  throw new Error("Context 2D is not supported")

const scene: Scene = [
  ["gray", "gray", "cyan", "purple", "gray", "gray", "gray", "gray", "gray", "gray"],
  ["gray", null, null, "yellow", null, null, null, null, null, "gray"],
  ["gray", "red", null, "blue", null, null, null, null, null, "gray"],
  ["gray", "green", null, null, null, null, null, null, null, "gray"],
  ["gray", null, null, null, null, null, null, null, null, "gray"],
  ["gray", null, null, null, null, null, null, null, null, "gray"],
  ["gray", "gray", "gray", "gray", "gray", "gray", "gray", "gray", "gray", "gray"],
]
const player = new Player(
  sceneSize(scene).mul(new Vector2(0.63, 0.63)),
  Math.PI * 1.25
)

window.addEventListener("keydown", (e) => {
  switch (e.code) {
    case 'KeyW':
      player.position = player.position
        .add(Vector2.fromAngle(player.direction).scale(PLAYER_STEP_LEN))
      renderGame(ctx, player, scene)
      break
    case 'KeyS':
      player.position = player.position
        .sub(Vector2.fromAngle(player.direction).scale(PLAYER_STEP_LEN))
      renderGame(ctx, player, scene)
      break
    case 'KeyD':
      player.position = player.position
        .add(Vector2.fromAngle(player.direction).rot90().scale(PLAYER_STEP_LEN))
      renderGame(ctx, player, scene)
      break
    case 'KeyA':
      player.position = player.position
        .sub(Vector2.fromAngle(player.direction).rot90().scale(PLAYER_STEP_LEN))
      renderGame(ctx, player, scene)
      break
    case 'KeyE':
      player.direction += Math.PI * 0.1
      renderGame(ctx, player, scene)
      break
    case 'KeyQ':
      player.direction -= Math.PI * 0.1
      renderGame(ctx, player, scene)
      break
  }
})

let lastClientX: number | null = null

game.addEventListener('mousemove', (e) => {
  if (lastClientX) {
    player.direction += (e.clientX - lastClientX) * CAMERA_SENSITIVITY / 50
    renderGame(ctx, player, scene)
  }
  lastClientX = e.clientX
})

renderGame(ctx, player, scene)
