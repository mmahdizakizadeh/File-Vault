import mimetypes
from pathlib import Path
from django.conf import settings
from django.contrib.auth import login, logout
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.db.models import Max
from django.http import FileResponse, Http404, JsonResponse
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.utils.text import get_valid_filename
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import University, Course, ExerciseSeries, ExerciseFile, Submission, SubmissionFile, AuditLog
from .serializers import UniversitySerializer, CourseSerializer, ExerciseSerializer, SubmissionSerializer
from .file_validation import validate_upload

def health(request): return JsonResponse({"status": "ok", "service": "filevault-api"})

@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def csrf(request):
    return Response({"csrfToken": get_token(request)})

class SessionLogin(APIView):
    permission_classes = [permissions.AllowAny]
    def post(self, request):
        from django.contrib.auth import authenticate
        user = authenticate(request, username=request.data.get("username"), password=request.data.get("password"))
        if user is None: return Response({"detail": "نام کاربری یا گذرواژه نادرست است."}, status=400)
        login(request, user)
        return Response({"id": user.id, "username": user.username, "email": user.email})

class SessionLogout(APIView):
    def post(self, request):
        logout(request)
        return Response({"detail": "خروج انجام شد."})

class Me(APIView):
    def get(self, request): return Response({"id": request.user.id, "username": request.user.username, "email": request.user.email})

class PublicUniversityList(generics.ListAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = UniversitySerializer
    queryset = University.objects.filter(is_active=True)

class PublicCourseList(generics.ListAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = CourseSerializer
    def get_queryset(self): return Course.objects.filter(is_active=True, university_id=self.request.query_params.get("university"))

class PublicExerciseList(generics.ListAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = ExerciseSerializer
    def get_queryset(self):
        return ExerciseSeries.objects.filter(status=ExerciseSeries.Status.PUBLISHED).select_related("course", "course__university").prefetch_related("files")

class TeacherExerciseListCreate(generics.ListCreateAPIView):
    serializer_class = ExerciseSerializer
    def get_queryset(self): return ExerciseSeries.objects.filter(teacher=self.request.user).select_related("course").prefetch_related("files")
    def perform_create(self, serializer):
        course = serializer.validated_data["course"]
        exercise = serializer.save(teacher=self.request.user)
        AuditLog.objects.create(actor=self.request.user, action="exercise.created", object_type="ExerciseSeries", object_id=str(exercise.pk))

class TeacherExerciseDetail(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ExerciseSerializer
    def get_queryset(self): return ExerciseSeries.objects.filter(teacher=self.request.user)
    def perform_destroy(self, instance):
        instance.status = ExerciseSeries.Status.ARCHIVED
        instance.save(update_fields=["status", "updated_at"])

class PublishExercise(APIView):
    def post(self, request, pk):
        exercise = get_object_or_404(ExerciseSeries, pk=pk, teacher=request.user)
        exercise.status = ExerciseSeries.Status.PUBLISHED
        exercise.save(update_fields=["status", "updated_at"])
        return Response({"status": exercise.status})

class ExerciseUpload(APIView):
    parser_classes = [MultiPartParser, FormParser]
    def post(self, request, pk):
        exercise = get_object_or_404(ExerciseSeries, pk=pk, teacher=request.user)
        uploads = request.FILES.getlist("files")
        if not uploads: raise ValidationError("حداقل یک فایل انتخاب کنید.")
        if len(uploads) > settings.MAX_FILES_PER_SUBMISSION: raise ValidationError("تعداد فایل‌ها بیش از حد مجاز است.")
        created = []
        for upload in uploads:
            validate_upload(upload)
            created.append(ExerciseFile.objects.create(exercise=exercise, file=upload, original_name=get_valid_filename(upload.name)[:255], content_type=upload.content_type or "", size=upload.size))
        return Response({"uploaded": len(created)}, status=201)

class PublicSubmissionCreate(APIView):
    permission_classes = [permissions.AllowAny]
    parser_classes = [MultiPartParser, FormParser]
    @transaction.atomic
    def post(self, request, exercise_id):
        exercise = get_object_or_404(ExerciseSeries, pk=exercise_id, status=ExerciseSeries.Status.PUBLISHED)
        uploads = request.FILES.getlist("files")
        if len(uploads) > settings.MAX_FILES_PER_SUBMISSION: raise ValidationError("تعداد فایل‌ها بیش از حد مجاز است.")
        for upload in uploads: validate_upload(upload)
        student_number = str(request.data.get("student_number", "")).strip()
        if not student_number: raise ValidationError({"student_number": "شماره دانشجویی الزامی است."})
        last = Submission.objects.filter(exercise=exercise, student_number=student_number).aggregate(v=Max("attempt_number"))["v"] or 0
        submission = Submission.objects.create(
            exercise=exercise, first_name=request.data.get("first_name", "").strip(),
            last_name=request.data.get("last_name", "").strip(), student_number=student_number,
            email=request.data.get("email", "").strip(), message=request.data.get("message", ""),
            attempt_number=last + 1)
        if not submission.first_name or not submission.last_name or not submission.email:
            raise ValidationError("نام، نام خانوادگی و ایمیل الزامی است.")
        for upload in uploads:
            SubmissionFile.objects.create(submission=submission, file=upload,
                original_name=get_valid_filename(upload.name)[:255],
                content_type=upload.content_type or "", size=upload.size)
        return Response({"receipt_token": str(submission.receipt_token), "attempt_number": submission.attempt_number}, status=201)

class TeacherSubmissionList(generics.ListAPIView):
    serializer_class = SubmissionSerializer
    def get_queryset(self):
        return Submission.objects.filter(exercise__teacher=self.request.user).select_related("exercise").prefetch_related("files")

class TeacherSubmissionDetail(generics.RetrieveAPIView):
    serializer_class = SubmissionSerializer
    def get_queryset(self): return Submission.objects.filter(exercise__teacher=self.request.user).select_related("exercise").prefetch_related("files")

def protected_file_response(request, model, pk, owner_lookup):
    obj = get_object_or_404(model.objects.select_related(), pk=pk)
    if not request.user.is_authenticated: raise Http404
    owner_id = owner_lookup(obj)
    if owner_id != request.user.id: raise Http404
    path = Path(obj.file.path)
    if not path.is_file(): raise Http404
    response = FileResponse(open(path, "rb"), as_attachment=True, filename=obj.original_name)
    response["X-Content-Type-Options"] = "nosniff"
    return response

class ExerciseFileDownload(APIView):
    def get(self, request, pk):
        return protected_file_response(request, ExerciseFile, pk, lambda o: o.exercise.teacher_id)

class SubmissionFileDownload(APIView):
    def get(self, request, pk):
        return protected_file_response(request, SubmissionFile, pk, lambda o: o.submission.exercise.teacher_id)
