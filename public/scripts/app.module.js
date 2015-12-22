(function () {
    'use strict';

    function FestiveController ($scope, $http, $interval) {
        $interval(function cheerLightsMonitor () {
            $http({
                method : 'GET',
                url : 'http://api.thingspeak.com/channels/1417/field/2/last.json'
            }).then(function success (response) {
                $scope.treeStyle = { color: response.data.field2 };
            });
        }, 10 * 1000);

        $scope.detectScrooge = function detectScrooge () {
            $scope.isClassifying = true;
            var requestText = $scope.festiveText;

            if($scope.festiveText){
                $http({
                    method : 'POST',
                    headers: {'Content-Type': 'text/plain'},
                    url : 'http://festometer.mybluemix.net/api/yule-logs/',
                    //url : '/api/yule-logs/',
                    data : requestText
                }).then(function success (response) {
                    $scope.yuleLogs.unshift(response.data);
                    $scope.festiveText = null;
                    $scope.isClassifying = false
                }, function fail (error) {
                    var errorResult = {
                        'quote': '"' + requestText + '" (Unknown)'
                    }
                    $scope.yuleLogs.unshift(errorResult);
                    console.log(error);
                    $scope.festiveText = null;
                    $scope.isClassifying = false
                });

                $scope.festiveText = 'Calculating bah humbug index...';
            }
        };

        $scope.updateExpectedClass = function updateExpectedClass (result, correct) {
            var id = result.id;

            // provide immediate feedback by removing the result
            $scope.yuleLogs = $scope.yuleLogs.filter(function (el) {
                return el.id !== id;
            });
            //$scope.$apply();

            // work out what the result should have been
            var actualClass = result.classes[0].class_name;
            if (correct !== true) {
                actualClass = result.classes[1].class_name;
            }

            // update the result in couchdb
            $http({
                method : 'PUT',
                headers: {'Content-Type': 'text/plain'},
                url : 'http://festometer.mybluemix.net/api/yule-logs/' + id,
                //url : '/api/yule-logs/' + id,
                data : actualClass
            }).then(function success (response) {
                // do nothing
            }, function fail (error) {
                console.log(error);
            });
        }

        $scope.isClassifying = false;

        $scope.yuleLogs = [ ];

        //$scope.yuleLogs = [ {"classifier_id":"A3DA1Dx15-nlc-358","url":"https://gateway.watsonplatform.net/natural-language-classifier/api/v1/classifiers/A3DA1Dx15-nlc-358","text":"Find out whether the fest-o-meter thinks you love Christmas as much as Bob Cratchit, or whether you'll be sharing humbugs with Ebenezer Scrooge. This is just an experiment to see how easy it is to train a Watson Natural Language Classifier to detect all the Scrooges out there. The fest-o-meter still needs more training so any bah humbug examples or extreme festivity should help Watson improve!","top_class":"scrooge","classes":[{"class_name":"scrooge","confidence":0.9956084868079902},{"class_name":"cratchit","confidence":0.004391513192009913}],"created_at":"2015-12-21T22:25:36+00:00","quote":"\"Find out whether the fest-o-meter thinks you love Christmas as much as Bob Cratchit, or whether you'll be sharing humbugs with Ebenezer Scrooge. This is just an experiment to see how easy it is to train a Watson Natural Language Classifier to detect all the Scrooges out there. The fest-o-meter still needs more training so any bah humbug examples or extreme festivity should help Watson improve!\" (Scrooge, 2015)","id":"a08d1fc50557a45353fcbb4ff80428bb"} ];

        $scope.treeStyle = { color: '#008000' };
    }

    function CapitaliseFilter () {
        return function(input) {
            return (!!input) ? input.charAt(0).toUpperCase() + input.substr(1).toLowerCase() : '';
        }
    }

    angular
        .module('app', [])
        .controller('FestiveController', ['$scope', '$http', '$interval', FestiveController])
        .filter('capitalise', CapitaliseFilter);


})();


