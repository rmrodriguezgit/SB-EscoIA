// Native C++ implementation behind a C-compatible process/JSON boundary.
// YuNet detects landmarks; ArcFace ONNX extracts exactly 512 dimensions.
#include <opencv2/opencv.hpp>
#include <opencv2/objdetect.hpp>
#include <iostream>
#include <cmath>
extern "C" int face_embedding(const char *image,const char *detector,const char *recognizer,float out[512],double *pose){
 try {
  cv::Mat img=cv::imread(image);if(img.empty()||img.cols>1920||img.rows>1920)return 1;
  static cv::Ptr<cv::FaceDetectorYN> det;
  static cv::dnn::Net net;
  if(det.empty()) det=cv::FaceDetectorYN::create(detector,"",img.size(),0.9f,0.3f,5000);
  det->setInputSize(img.size());
  cv::Mat faces;det->detect(img,faces);if(faces.rows!=1)return 2;
  if(faces.at<float>(0,2)<80||faces.at<float>(0,3)<80)return 3;
  cv::Rect area((int)faces.at<float>(0,0),(int)faces.at<float>(0,1),(int)faces.at<float>(0,2),(int)faces.at<float>(0,3));
  area &= cv::Rect(0,0,img.cols,img.rows);
  if(area.width<80 || area.height<80)return 3;
  cv::Mat gray,lap;cv::cvtColor(img(area),gray,cv::COLOR_BGR2GRAY);cv::Laplacian(gray,lap,CV_64F);
  cv::Scalar average,deviation;cv::meanStdDev(lap,average,deviation);double light=cv::mean(gray)[0];
  if(deviation[0]*deviation[0]<10 || light<18 || light>245)return 7;
  float target[5][2]={{38.2946f,51.6963f},{73.5318f,51.5014f},{56.0252f,71.7366f},{41.5493f,92.3655f},{70.7299f,92.2041f}};
  cv::Mat a(10,4,CV_64F),b(10,1,CV_64F),x;
  for(int i=0;i<5;i++){double sx=faces.at<float>(0,4+2*i),sy=faces.at<float>(0,5+2*i);a.at<double>(2*i,0)=sx;a.at<double>(2*i,1)=-sy;a.at<double>(2*i,2)=1;a.at<double>(2*i,3)=0;a.at<double>(2*i+1,0)=sy;a.at<double>(2*i+1,1)=sx;a.at<double>(2*i+1,2)=0;a.at<double>(2*i+1,3)=1;b.at<double>(2*i)=target[i][0];b.at<double>(2*i+1)=target[i][1];}
  if(!cv::solve(a,b,x,cv::DECOMP_SVD))return 4;
  cv::Mat matrix=(cv::Mat_<double>(2,3)<<x.at<double>(0),-x.at<double>(1),x.at<double>(2),x.at<double>(1),x.at<double>(0),x.at<double>(3)),aligned;
  cv::warpAffine(img,aligned,matrix,cv::Size(112,112));if(net.empty())net=cv::dnn::readNetFromONNX(recognizer);net.setPreferableBackend(cv::dnn::DNN_BACKEND_OPENCV);net.setPreferableTarget(cv::dnn::DNN_TARGET_CPU);
  net.setInput(cv::dnn::blobFromImage(aligned,1.0/127.5,cv::Size(112,112),cv::Scalar(127.5,127.5,127.5),true,false));cv::Mat v=net.forward().reshape(1,1);if(v.total()!=512)return 5;double norm=0;for(int i=0;i<512;i++){out[i]=v.at<float>(i);if(!std::isfinite(out[i]))return 5;norm+=out[i]*(double)out[i];}if(norm<=0)return 5;for(int i=0;i<512;i++)out[i]/=(float)std::sqrt(norm);
  double right=faces.at<float>(0,4),left=faces.at<float>(0,6),nose=faces.at<float>(0,8);*pose=(nose-(right+left)/2)/std::max(std::abs(left-right),1.0);return 0;
 }catch(const cv::Exception &){return 6;}
}
static int emit(const char *image,const char *detector,const char *recognizer){float out[512];double pose;int rc=face_embedding(image,detector,recognizer,out,&pose);if(rc){std::cerr<<"Captura facial invalida: "<<rc<<"\n";return rc;}std::cout<<"{\"pose\":"<<pose<<",\"vector\":[";for(int i=0;i<512;i++){if(i)std::cout<<',';std::cout<<out[i];}std::cout<<"]}";return 0;}
int main(int argc,char **argv){
 if(argc==4){int rc=emit(argv[1],argv[2],argv[3]);if(!rc)std::cout<<"\n";return rc;}
 if(argc==7 && std::string(argv[1])=="--batch"){
  cv::setNumThreads(2);std::cout<<"[";
  for(int i=4;i<7;i++){if(i>4)std::cout<<",";int rc=emit(argv[i],argv[2],argv[3]);if(rc)return rc;}
  std::cout<<"]\n";return 0;
 }
 return 2;
}
