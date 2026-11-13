import uuid
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone

def private_upload_path(instance, filename):
    # Never preserve a client-supplied filename.
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    return f"private/{timezone.now():%Y/%m}/{uuid.uuid4().hex}.{suffix}"

class Teacher(AbstractUser):
    email = models.EmailField(blank=False, unique=True)

class University(models.Model):
    name = models.CharField(max_length=180, unique=True)
    is_active = models.BooleanField(default=True)
    def __str__(self): return self.name

class Course(models.Model):
    university = models.ForeignKey(University, on_delete=models.PROTECT, related_name="courses")
    title = models.CharField(max_length=180)
    code = models.CharField(max_length=40, blank=True)
    is_active = models.BooleanField(default=True)
    class Meta:
        unique_together = ("university", "title")
    def __str__(self): return f"{self.title} ({self.university})"

class ExerciseSeries(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "پیش‌نویس"
        PUBLISHED = "published", "منتشرشده"
        ARCHIVED = "archived", "بایگانی"
    teacher = models.ForeignKey(Teacher, on_delete=models.CASCADE, related_name="exercise_series")
    course = models.ForeignKey(Course, on_delete=models.PROTECT, related_name="exercise_series")
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        ordering = ["-created_at"]
    def __str__(self): return self.title

class ExerciseFile(models.Model):
    exercise = models.ForeignKey(ExerciseSeries, on_delete=models.CASCADE, related_name="files")
    file = models.FileField(upload_to=private_upload_path)
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=120, blank=True)
    size = models.PositiveBigIntegerField(default=0)
    uploaded_at = models.DateTimeField(auto_now_add=True)

class Submission(models.Model):
    exercise = models.ForeignKey(ExerciseSeries, on_delete=models.PROTECT, related_name="submissions")
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    student_number = models.CharField(max_length=40)
    email = models.EmailField()
    message = models.TextField(blank=True)
    receipt_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    attempt_number = models.PositiveIntegerField()
    submitted_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        ordering = ["-submitted_at"]
        constraints = [models.UniqueConstraint(fields=["exercise", "student_number", "attempt_number"], name="unique_student_attempt")]
    def __str__(self): return f"{self.student_number} / {self.exercise}"

class SubmissionFile(models.Model):
    submission = models.ForeignKey(Submission, on_delete=models.CASCADE, related_name="files")
    file = models.FileField(upload_to=private_upload_path)
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=120, blank=True)
    size = models.PositiveBigIntegerField(default=0)

class AuditLog(models.Model):
    actor = models.ForeignKey(Teacher, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=80)
    object_type = models.CharField(max_length=80)
    object_id = models.CharField(max_length=80)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
