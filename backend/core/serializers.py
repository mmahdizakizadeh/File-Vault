from rest_framework import serializers
from .models import University, Course, ExerciseSeries, ExerciseFile, Submission, SubmissionFile

class UniversitySerializer(serializers.ModelSerializer):
    class Meta: model = University; fields = ["id", "name"]

class CourseSerializer(serializers.ModelSerializer):
    university_name = serializers.CharField(source="university.name", read_only=True)
    class Meta: model = Course; fields = ["id", "title", "code", "university", "university_name"]

class ExerciseFileSerializer(serializers.ModelSerializer):
    class Meta: model = ExerciseFile; fields = ["id", "original_name", "content_type", "size"]

class ExerciseSerializer(serializers.ModelSerializer):
    files = ExerciseFileSerializer(many=True, read_only=True)
    class Meta:
        model = ExerciseSeries
        fields = ["id", "course", "title", "description", "due_at", "status", "files", "created_at"]
        read_only_fields = ["id", "status", "created_at"]

class SubmissionFileSerializer(serializers.ModelSerializer):
    class Meta: model = SubmissionFile; fields = ["id", "original_name", "content_type", "size"]

class SubmissionSerializer(serializers.ModelSerializer):
    files = SubmissionFileSerializer(many=True, read_only=True)
    class Meta:
        model = Submission
        fields = ["id", "exercise", "first_name", "last_name", "student_number", "email",
                  "message", "receipt_token", "attempt_number", "submitted_at", "files"]
        read_only_fields = ["id", "receipt_token", "attempt_number", "submitted_at"]
