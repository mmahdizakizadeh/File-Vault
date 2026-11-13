from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from .models import Teacher, University, Course, ExerciseSeries

class PublicExerciseTests(TestCase):
    def setUp(self):
        self.teacher = Teacher.objects.create_user(username="teacher1", password="StrongPass123!", email="t@example.com")
        university = University.objects.create(name="دانشگاه نمونه")
        course = Course.objects.create(university=university, title="برنامه‌نویسی")
        self.exercise = ExerciseSeries.objects.create(teacher=self.teacher, course=course, title="تمرین اول", status="published")
    def test_published_exercise_is_public(self):
        response = self.client.get("/api/v1/exercises/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
