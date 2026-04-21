package com.aline2.arfilters

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PointF
import android.graphics.PorterDuff
import android.graphics.Rect
import android.graphics.RectF
import android.util.Log
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.components.containers.NormalizedLandmark
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarkerResult
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt
import org.webrtc.JavaI420Buffer
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoFrame
import org.webrtc.YuvHelper

private const val TAG = "DogFaceFilter"
private const val MODEL_ASSET_PATH = "face_landmarker.task"
private const val MAX_INFERENCE_EDGE = 288
private const val INFERENCE_INTERVAL_MS = 80L
private const val RESULT_TTL_MS = 600L

private const val FOREHEAD_TOP_INDEX = 10
private const val CHIN_INDEX = 152
private const val LEFT_TEMPLE_INDEX = 127
private const val RIGHT_TEMPLE_INDEX = 356
private const val LEFT_EYE_OUTER_INDEX = 33
private const val LEFT_EYE_INNER_INDEX = 133
private const val RIGHT_EYE_INNER_INDEX = 362
private const val RIGHT_EYE_OUTER_INDEX = 263
private const val NOSE_TIP_INDEX = 1
private const val NOSE_LEFT_INDEX = 98
private const val NOSE_RIGHT_INDEX = 327

class DogFaceFilterProcessorFactory(
  private val context: Context,
) : VideoFrameProcessorFactoryInterface {
  override fun build(): VideoFrameProcessor = DogFaceFilterProcessor(context)
}

private class DogFaceFilterProcessor(
  private val appContext: Context,
) : VideoFrameProcessor {
  private val inferenceExecutor: ExecutorService =
    Executors.newSingleThreadExecutor { runnable ->
      Thread(runnable, "AlineDogFaceInference").apply { isDaemon = true }
    }
  private val inferenceInFlight = AtomicBoolean(false)
  private val lastQueuedInferenceTimestampMs = AtomicLong(-1L)
  private val latestFaceState = AtomicReference<FaceAnchorState?>(null)
  private val colorCache = HashMap<Int, YuvColor>()
  private val renderer = DogFaceOverlayRenderer()
  private val landmarkerLock = Any()

  @Volatile
  private var faceLandmarker: FaceLandmarker? = null
  private var overlayBitmap: Bitmap? = null
  private var overlayCanvas: Canvas? = null
  private var overlayPixels = IntArray(0)

  override fun process(frame: VideoFrame, textureHelper: SurfaceTextureHelper): VideoFrame {
    val inputBuffer = frame.buffer.toI420() ?: return frame

    return try {
      try {
        maybeQueueInference(inputBuffer, frame.rotation, frame.timestampNs)

        val outputBuffer = copyBuffer(inputBuffer)
        val currentFaceState = latestFaceState.get()

        if (currentFaceState != null && frame.timestampNs / 1_000_000L - currentFaceState.timestampMs <= RESULT_TTL_MS) {
          val overlayBounds = renderOverlay(outputBuffer.width, outputBuffer.height, currentFaceState)
          if (!overlayBounds.isEmpty) {
            compositeOverlay(outputBuffer, overlayBounds)
          }
        }

        VideoFrame(outputBuffer, frame.rotation, frame.timestampNs)
      } finally {
        inputBuffer.release()
      }
    } catch (error: Exception) {
      Log.w(TAG, "Falling back to the raw frame", error)
      frame
    }
  }

  private fun maybeQueueInference(
    inputBuffer: VideoFrame.I420Buffer,
    rotationDegrees: Int,
    timestampNs: Long,
  ) {
    val timestampMs = timestampNs / 1_000_000L
    val lastQueuedTimestamp = lastQueuedInferenceTimestampMs.get()

    if (timestampMs <= lastQueuedTimestamp || timestampMs - lastQueuedTimestamp < INFERENCE_INTERVAL_MS) {
      return
    }

    if (!inferenceInFlight.compareAndSet(false, true)) {
      return
    }

    val sampledBitmap = createSampleBitmap(inputBuffer, normalizeRotation(rotationDegrees)) ?: run {
      inferenceInFlight.set(false)
      return
    }

    lastQueuedInferenceTimestampMs.set(timestampMs)

    inferenceExecutor.execute {
      try {
        val landmarker = ensureFaceLandmarker()
        val mpImage = BitmapImageBuilder(sampledBitmap).build()
        val result = landmarker.detectForVideo(mpImage, timestampMs)
        latestFaceState.set(
          FaceAnchorState.from(
            result = result,
            rotationDegrees = normalizeRotation(rotationDegrees),
            timestampMs = timestampMs,
          ),
        )
      } catch (error: Exception) {
        Log.w(TAG, "Face detection skipped for this frame", error)
      } finally {
        sampledBitmap.recycle()
        inferenceInFlight.set(false)
      }
    }
  }

  private fun ensureFaceLandmarker(): FaceLandmarker {
    faceLandmarker?.let { return it }

    synchronized(landmarkerLock) {
      faceLandmarker?.let { return it }

      val baseOptions =
        BaseOptions.builder()
          .setModelAssetPath(MODEL_ASSET_PATH)
          .build()

      val options =
        FaceLandmarker.FaceLandmarkerOptions.builder()
          .setBaseOptions(baseOptions)
          .setRunningMode(RunningMode.VIDEO)
          .setNumFaces(1)
          .setMinFaceDetectionConfidence(0.55f)
          .setMinFacePresenceConfidence(0.55f)
          .setMinTrackingConfidence(0.5f)
          .setOutputFaceBlendshapes(false)
          .setOutputFacialTransformationMatrixes(false)
          .build()

      return FaceLandmarker.createFromOptions(appContext, options).also {
        faceLandmarker = it
      }
    }
  }

  private fun copyBuffer(inputBuffer: VideoFrame.I420Buffer): JavaI420Buffer {
    val outputBuffer = JavaI420Buffer.allocate(inputBuffer.width, inputBuffer.height)
    YuvHelper.I420Copy(
      inputBuffer.dataY,
      inputBuffer.strideY,
      inputBuffer.dataU,
      inputBuffer.strideU,
      inputBuffer.dataV,
      inputBuffer.strideV,
      outputBuffer.dataY,
      outputBuffer.strideY,
      outputBuffer.dataU,
      outputBuffer.strideU,
      outputBuffer.dataV,
      outputBuffer.strideV,
      inputBuffer.width,
      inputBuffer.height,
    )
    return outputBuffer
  }

  private fun renderOverlay(
    width: Int,
    height: Int,
    faceState: FaceAnchorState,
  ): Rect {
    ensureOverlaySurface(width, height)
    val canvas = overlayCanvas ?: return Rect()

    canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
    val bounds = renderer.render(canvas, width, height, faceState)
    return Rect(
      max(0, bounds.left.toInt()),
      max(0, bounds.top.toInt()),
      min(width, ceil(bounds.right).toInt()),
      min(height, ceil(bounds.bottom).toInt()),
    )
  }

  private fun ensureOverlaySurface(width: Int, height: Int) {
    val currentBitmap = overlayBitmap
    if (currentBitmap != null && currentBitmap.width == width && currentBitmap.height == height) {
      return
    }

    currentBitmap?.recycle()
    overlayBitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    overlayCanvas = Canvas(overlayBitmap!!)
  }

  private fun compositeOverlay(
    outputBuffer: JavaI420Buffer,
    bounds: Rect,
  ) {
    val bitmap = overlayBitmap ?: return
    if (bounds.width() <= 0 || bounds.height() <= 0) {
      return
    }

    val regionWidth = bounds.width()
    val regionHeight = bounds.height()
    val requiredSize = regionWidth * regionHeight
    if (overlayPixels.size < requiredSize) {
      overlayPixels = IntArray(requiredSize)
    }

    bitmap.getPixels(overlayPixels, 0, regionWidth, bounds.left, bounds.top, regionWidth, regionHeight)

    val dataY = outputBuffer.dataY
    val dataU = outputBuffer.dataU
    val dataV = outputBuffer.dataV
    val strideY = outputBuffer.strideY
    val strideU = outputBuffer.strideU
    val strideV = outputBuffer.strideV

    for (row in 0 until regionHeight) {
      for (column in 0 until regionWidth) {
        val argb = overlayPixels[row * regionWidth + column]
        val alpha = argb ushr 24 and 0xFF
        if (alpha == 0) {
          continue
        }

        val color = resolveYuvColor(argb)
        val x = bounds.left + column
        val y = bounds.top + row
        val yIndex = y * strideY + x
        val uIndex = (y / 2) * strideU + (x / 2)
        val vIndex = (y / 2) * strideV + (x / 2)

        val currentY = dataY.get(yIndex).toInt() and 0xFF
        val currentU = dataU.get(uIndex).toInt() and 0xFF
        val currentV = dataV.get(vIndex).toInt() and 0xFF

        dataY.put(yIndex, blendChannel(currentY, color.y, alpha).toByte())
        dataU.put(uIndex, blendChannel(currentU, color.u, alpha).toByte())
        dataV.put(vIndex, blendChannel(currentV, color.v, alpha).toByte())
      }
    }
  }

  private fun resolveYuvColor(argb: Int): YuvColor {
    return colorCache.getOrPut(argb) { YuvColor.fromArgb(argb) }
  }

  private fun createSampleBitmap(
    inputBuffer: VideoFrame.I420Buffer,
    rotationDegrees: Int,
  ): Bitmap? {
    val sourceWidth = inputBuffer.width
    val sourceHeight = inputBuffer.height
    val rotatedWidth = if (rotationDegrees == 90 || rotationDegrees == 270) sourceHeight else sourceWidth
    val rotatedHeight = if (rotationDegrees == 90 || rotationDegrees == 270) sourceWidth else sourceHeight
    if (rotatedWidth <= 0 || rotatedHeight <= 0) {
      return null
    }

    val scale = min(1f, MAX_INFERENCE_EDGE.toFloat() / max(rotatedWidth, rotatedHeight).toFloat())
    val outputWidth = max(1, (rotatedWidth * scale).roundToInt())
    val outputHeight = max(1, (rotatedHeight * scale).roundToInt())
    val pixels = IntArray(outputWidth * outputHeight)

    for (row in 0 until outputHeight) {
      val normalizedY = (row + 0.5f) / outputHeight
      for (column in 0 until outputWidth) {
        val normalizedX = (column + 0.5f) / outputWidth
        val samplePoint = uprightToBuffer(normalizedX, normalizedY, rotationDegrees)

        val sampleX = clampInt((samplePoint.x * sourceWidth).roundToInt(), 0, sourceWidth - 1)
        val sampleY = clampInt((samplePoint.y * sourceHeight).roundToInt(), 0, sourceHeight - 1)
        val yPlaneValue = inputBuffer.dataY.get(sampleY * inputBuffer.strideY + sampleX).toInt() and 0xFF
        val uPlaneValue =
          inputBuffer.dataU.get((sampleY / 2) * inputBuffer.strideU + (sampleX / 2)).toInt() and 0xFF
        val vPlaneValue =
          inputBuffer.dataV.get((sampleY / 2) * inputBuffer.strideV + (sampleX / 2)).toInt() and 0xFF

        pixels[row * outputWidth + column] = yuvToArgb(yPlaneValue, uPlaneValue, vPlaneValue)
      }
    }

    return Bitmap.createBitmap(pixels, outputWidth, outputHeight, Bitmap.Config.ARGB_8888)
  }
}

private class DogFaceOverlayRenderer {
  private val outerEarPaint =
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(255, 139, 90, 43)
      style = Paint.Style.FILL
    }
  private val innerEarPaint =
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(240, 233, 178, 170)
      style = Paint.Style.FILL
    }
  private val nosePaint =
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(255, 34, 23, 18)
      style = Paint.Style.FILL
    }
  private val noseHighlightPaint =
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(168, 255, 238, 226)
      style = Paint.Style.FILL
    }

  fun render(
    canvas: Canvas,
    frameWidth: Int,
    frameHeight: Int,
    faceState: FaceAnchorState,
  ): RectF {
    val topHead = faceState.topHead.toPoint(frameWidth, frameHeight)
    val chin = faceState.chin.toPoint(frameWidth, frameHeight)
    val leftTemple = faceState.leftTemple.toPoint(frameWidth, frameHeight)
    val rightTemple = faceState.rightTemple.toPoint(frameWidth, frameHeight)
    val leftEye = faceState.leftEyeCenter.toPoint(frameWidth, frameHeight)
    val rightEye = faceState.rightEyeCenter.toPoint(frameWidth, frameHeight)
    val noseTip = faceState.noseTip.toPoint(frameWidth, frameHeight)
    val noseLeft = faceState.noseLeft.toPoint(frameWidth, frameHeight)
    val noseRight = faceState.noseRight.toPoint(frameWidth, frameHeight)

    val faceRight = (rightTemple - leftTemple).normalized()
    val faceUp =
      (topHead - chin).normalized().takeIf { it.length() > 0.0001f }
        ?: Vec2(0f, -1f)

    val faceWidth = max(42f, leftTemple.distanceTo(rightTemple))
    val eyeDistance = max(28f, leftEye.distanceTo(rightEye))
    val earWidth = faceWidth * 0.30f
    val earHeight = faceWidth * 0.52f

    val leftEarCenter = topHead + faceRight * (-faceWidth * 0.31f) + faceUp * (-earHeight * 0.10f)
    val rightEarCenter = topHead + faceRight * (faceWidth * 0.31f) + faceUp * (-earHeight * 0.10f)

    val overallBounds = RectF()
    val boundsBuffer = RectF()
    val reusablePath = Path()

    drawEar(
      canvas = canvas,
      path = reusablePath,
      bounds = boundsBuffer,
      overallBounds = overallBounds,
      center = leftEarCenter,
      faceUp = faceUp,
      faceRight = faceRight * -1f,
      earWidth = earWidth,
      earHeight = earHeight,
    )

    drawEar(
      canvas = canvas,
      path = reusablePath,
      bounds = boundsBuffer,
      overallBounds = overallBounds,
      center = rightEarCenter,
      faceUp = faceUp,
      faceRight = faceRight,
      earWidth = earWidth,
      earHeight = earHeight,
    )

    val noseCenter = Vec2((noseLeft.x + noseRight.x + noseTip.x) / 3f, (noseLeft.y + noseRight.y + noseTip.y) / 3f)
    val noseWidth = max(eyeDistance * 0.34f, noseLeft.distanceTo(noseRight) * 1.65f)
    val noseHeight = noseWidth * 0.72f
    val noseRect =
      RectF(
        noseCenter.x - noseWidth / 2f,
        noseCenter.y - noseHeight / 2f,
        noseCenter.x + noseWidth / 2f,
        noseCenter.y + noseHeight / 2f,
      )

    canvas.drawOval(noseRect, nosePaint)
    overallBounds.union(noseRect)

    val noseHighlightRect =
      RectF(
        noseRect.left + noseWidth * 0.16f,
        noseRect.top + noseHeight * 0.18f,
        noseRect.left + noseWidth * 0.42f,
        noseRect.top + noseHeight * 0.42f,
      )
    canvas.drawOval(noseHighlightRect, noseHighlightPaint)
    overallBounds.union(noseHighlightRect)

    overallBounds.inset(-10f, -10f)
    return overallBounds
  }

  private fun drawEar(
    canvas: Canvas,
    path: Path,
    bounds: RectF,
    overallBounds: RectF,
    center: Vec2,
    faceUp: Vec2,
    faceRight: Vec2,
    earWidth: Float,
    earHeight: Float,
  ) {
    val baseLeft = center + faceRight * (-earWidth * 0.55f) + faceUp * (earHeight * 0.18f)
    val baseRight = center + faceRight * (earWidth * 0.55f) + faceUp * (earHeight * 0.18f)
    val tip = center + faceUp * (-earHeight) + faceRight * (-earWidth * 0.10f)

    path.reset()
    path.moveTo(baseLeft.x, baseLeft.y)
    path.lineTo(baseRight.x, baseRight.y)
    path.lineTo(tip.x, tip.y)
    path.close()
    canvas.drawPath(path, outerEarPaint)
    path.computeBounds(bounds, true)
    overallBounds.union(bounds)

    val innerBaseLeft = center + faceRight * (-earWidth * 0.24f) + faceUp * (earHeight * 0.08f)
    val innerBaseRight = center + faceRight * (earWidth * 0.24f) + faceUp * (earHeight * 0.08f)
    val innerTip = center + faceUp * (-earHeight * 0.55f) + faceRight * (-earWidth * 0.02f)

    path.reset()
    path.moveTo(innerBaseLeft.x, innerBaseLeft.y)
    path.lineTo(innerBaseRight.x, innerBaseRight.y)
    path.lineTo(innerTip.x, innerTip.y)
    path.close()
    canvas.drawPath(path, innerEarPaint)
    path.computeBounds(bounds, true)
    overallBounds.union(bounds)
  }
}

private data class FaceAnchorState(
  val timestampMs: Long,
  val topHead: NormalizedPoint,
  val chin: NormalizedPoint,
  val leftTemple: NormalizedPoint,
  val rightTemple: NormalizedPoint,
  val leftEyeCenter: NormalizedPoint,
  val rightEyeCenter: NormalizedPoint,
  val noseTip: NormalizedPoint,
  val noseLeft: NormalizedPoint,
  val noseRight: NormalizedPoint,
) {
  companion object {
    fun from(
      result: FaceLandmarkerResult,
      rotationDegrees: Int,
      timestampMs: Long,
    ): FaceAnchorState? {
      val face = result.faceLandmarks().firstOrNull() ?: return null

      return FaceAnchorState(
        timestampMs = timestampMs,
        topHead = face.pointAt(FOREHEAD_TOP_INDEX, rotationDegrees) ?: return null,
        chin = face.pointAt(CHIN_INDEX, rotationDegrees) ?: return null,
        leftTemple = face.pointAt(LEFT_TEMPLE_INDEX, rotationDegrees) ?: return null,
        rightTemple = face.pointAt(RIGHT_TEMPLE_INDEX, rotationDegrees) ?: return null,
        leftEyeCenter =
          face.averagePoint(
            LEFT_EYE_OUTER_INDEX,
            LEFT_EYE_INNER_INDEX,
            rotationDegrees,
          ) ?: return null,
        rightEyeCenter =
          face.averagePoint(
            RIGHT_EYE_INNER_INDEX,
            RIGHT_EYE_OUTER_INDEX,
            rotationDegrees,
          ) ?: return null,
        noseTip = face.pointAt(NOSE_TIP_INDEX, rotationDegrees) ?: return null,
        noseLeft = face.pointAt(NOSE_LEFT_INDEX, rotationDegrees) ?: return null,
        noseRight = face.pointAt(NOSE_RIGHT_INDEX, rotationDegrees) ?: return null,
      )
    }
  }
}

private fun List<NormalizedLandmark>.pointAt(
  index: Int,
  rotationDegrees: Int,
): NormalizedPoint? {
  val landmark = getOrNull(index) ?: return null
  return uprightToBuffer(landmark.x(), landmark.y(), rotationDegrees)
}

private fun List<NormalizedLandmark>.averagePoint(
  firstIndex: Int,
  secondIndex: Int,
  rotationDegrees: Int,
): NormalizedPoint? {
  val firstPoint = pointAt(firstIndex, rotationDegrees) ?: return null
  val secondPoint = pointAt(secondIndex, rotationDegrees) ?: return null
  return NormalizedPoint(
    x = (firstPoint.x + secondPoint.x) / 2f,
    y = (firstPoint.y + secondPoint.y) / 2f,
  )
}

private data class NormalizedPoint(
  val x: Float,
  val y: Float,
) {
  fun toPoint(width: Int, height: Int): Vec2 =
    Vec2(
      x = x.coerceIn(0f, 1f) * width,
      y = y.coerceIn(0f, 1f) * height,
    )
}

private data class Vec2(
  val x: Float,
  val y: Float,
) {
  operator fun plus(other: Vec2): Vec2 = Vec2(x + other.x, y + other.y)
  operator fun minus(other: Vec2): Vec2 = Vec2(x - other.x, y - other.y)
  operator fun times(scale: Float): Vec2 = Vec2(x * scale, y * scale)

  fun length(): Float = sqrt(x * x + y * y)

  fun normalized(): Vec2 {
    val length = length()
    if (length <= 0.0001f) {
      return Vec2(0f, 0f)
    }

    return Vec2(x / length, y / length)
  }

  fun distanceTo(other: Vec2): Float = (this - other).length()
}

private data class YuvColor(
  val y: Int,
  val u: Int,
  val v: Int,
) {
  companion object {
    fun fromArgb(argb: Int): YuvColor {
      val red = argb shr 16 and 0xFF
      val green = argb shr 8 and 0xFF
      val blue = argb and 0xFF

      val yValue = clampInt(((66 * red + 129 * green + 25 * blue + 128) shr 8) + 16, 0, 255)
      val uValue = clampInt(((-38 * red - 74 * green + 112 * blue + 128) shr 8) + 128, 0, 255)
      val vValue = clampInt(((112 * red - 94 * green - 18 * blue + 128) shr 8) + 128, 0, 255)

      return YuvColor(yValue, uValue, vValue)
    }
  }
}

private fun blendChannel(
  baseValue: Int,
  overlayValue: Int,
  alpha: Int,
): Int = ((baseValue * (255 - alpha)) + (overlayValue * alpha)) / 255

private fun yuvToArgb(
  y: Int,
  u: Int,
  v: Int,
): Int {
  val clippedY = max(16, y)
  val chromaU = u - 128
  val chromaV = v - 128
  val scaledY = 298 * (clippedY - 16)
  val red = clampInt((scaledY + 409 * chromaV + 128) shr 8, 0, 255)
  val green = clampInt((scaledY - 100 * chromaU - 208 * chromaV + 128) shr 8, 0, 255)
  val blue = clampInt((scaledY + 516 * chromaU + 128) shr 8, 0, 255)
  return Color.argb(255, red, green, blue)
}

private fun uprightToBuffer(
  normalizedX: Float,
  normalizedY: Float,
  rotationDegrees: Int,
): NormalizedPoint {
  val clampedX = normalizedX.coerceIn(0f, 1f)
  val clampedY = normalizedY.coerceIn(0f, 1f)

  return when (normalizeRotation(rotationDegrees)) {
    90 -> NormalizedPoint(clampedY, 1f - clampedX)
    180 -> NormalizedPoint(1f - clampedX, 1f - clampedY)
    270 -> NormalizedPoint(1f - clampedY, clampedX)
    else -> NormalizedPoint(clampedX, clampedY)
  }
}

private fun normalizeRotation(rotationDegrees: Int): Int {
  val normalized = rotationDegrees % 360
  return if (normalized < 0) normalized + 360 else normalized
}

private fun clampInt(
  value: Int,
  minimum: Int,
  maximum: Int,
): Int = min(maximum, max(minimum, value))
