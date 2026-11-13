from django.urls import path
from . import views

urlpatterns = [
    path("auth/csrf/", views.csrf),
    path("auth/login/", views.SessionLogin.as_view()),
    path("auth/logout/", views.SessionLogout.as_view()),
    path("auth/me/", views.Me.as_view()),
    path("universities/", views.PublicUniversityList.as_view()),
    path("courses/", views.PublicCourseList.as_view()),
    path("exercises/", views.PublicExerciseList.as_view()),
    path("teacher/exercises/", views.TeacherExerciseListCreate.as_view()),
    path("teacher/exercises/<int:pk>/", views.TeacherExerciseDetail.as_view()),
    path("teacher/exercises/<int:pk>/publish/", views.PublishExercise.as_view()),
    path("teacher/exercises/<int:pk>/files/", views.ExerciseUpload.as_view()),
    path("public/exercises/<int:exercise_id>/submissions/", views.PublicSubmissionCreate.as_view()),
    path("teacher/submissions/", views.TeacherSubmissionList.as_view()),
    path("teacher/submissions/<int:pk>/", views.TeacherSubmissionDetail.as_view()),
    path("teacher/files/exercises/<int:pk>/download/", views.ExerciseFileDownload.as_view()),
    path("teacher/files/submissions/<int:pk>/download/", views.SubmissionFileDownload.as_view()),
]
