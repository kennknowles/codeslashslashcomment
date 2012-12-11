import org.scalacheck._
import org.scalacheck.Prop._
import org.scalacheck.Gen._

// Type classes are an idea originally from Haskell that you can implement in Scala via implicit parameters.
// This is not new or obscure, but so useful that another post on the subject can't hurt.
// I will keep this brief -- I have a lot to say about type classes, but first the basic idea needs to
// be extremely solid.

// Suppose you create a type such as a major-minor version scheme 

case class Version(major: Int, minor: Int)

// And suppose you want to serialize and deserialize it. To do this with a type class, you create
// a trait that represents the ability to serialize/deserialize a type. Instances of this trait/interface
// are "evidence" or instances of the type class. 

trait Serialize[T] {
  def _serialize(v:T) : String
  def _deserialize(s:String) : Option[T] // May fail. In a robust implementation, we'd return Either[T, ReasonItFailed]
}

// And then you define functions that utilize this trait. These are the "methods" of the type class.
// You probably also write a general property of the type class (via scalacheck)

object Serialize {
  def serialize[T](v: T)(implicit instance: Serialize[T]) = instance._serialize(v)
  def deserialize[T](s: String)(implicit instance: Serialize[T]) = instance._deserialize(s)

  def deserializeSerialize[T](v: T)(implicit instance: Serialize[T]) : Prop
    = (deserialize(serialize(v)) ?= Some(v))
}

// And then you define instances for the types you are interested in. You will often start with standard types
// and build up to yours (instances will generally go in separate modules). I'm actually not trying to make
// this robust, as you will generally want to go through an intermediate format such as JSON or XML which is
// more trivially compositional.

object SerializeInstances {
  import Serialize._

  implicit object serializeString extends Serialize[String] {
    def _serialize(v: String) = v
    def _deserialize(s: String) = Some(s)
  }

  implicit object serializeInt extends Serialize[Int] {
    def _serialize(v: Int) = v.toString
    def _deserialize(s: String) = 
      try { Some(s.toInt) } catch { case _ => None }
  }

  implicit def serializeTuple2[A, B]
    (implicit l: Serialize[A], r: Serialize[B]) = new Serialize[(A, B)] {

      def escape(s: String) = s.replaceAll("&", "&amp;")
                               .replaceAll(",", "&comma;")

      def unescape(s: String) = s.replaceAll("&comma;", ",")
                                 .replaceAll("&amp;", "&")

      def _serialize(v: (A, B)) = 
        escape(serialize(v._1)) + "," + escape(serialize(v._2))

      def _deserialize(s: String) = 
        s.split(",", -1).toList match {
          case leftS :: rightS :: Nil => {
            for(left <- deserialize[A](unescape(leftS)); 
                right <- deserialize[B](unescape(rightS))) 
            yield (left, right)
          }
          case _ => None
        }
    }
}

// Now you check that the property holds (via sbt console perhaps, or wrapping it is some scalatest test suite baggage)

// xsbt console

// scala> import Serialize._
// import Serialize._

// scala> import SerializeInstances._
// import SerializeInstances._

// scala> import org.scalacheck.Prop._
// import org.scalacheck.Prop._

// scala> forAll(deserializeSerialize[String] _) check
// + OK, passed 100 tests.

// scala> forAll(deserializeSerialize[Int] _) check
// + OK, passed 100 tests.

// scala> forAll(deserializeSerialize[(Int, String)] _) check
// + OK, passed 100 tests.

// Coming back to the Version type, we make a serialize instance for it. To test it, we also
// need to make an instance of Arbitrary - ScalaCheck is a key example of a great library
// built on type classes. 

object Version {
  import Serialize._
  import SerializeInstances._

  implicit def arbVersion = Arbitrary[Version] { 
    resultOf(Version.apply _) 
  }

  implicit object serializeVersion extends Serialize[Version] {
    def _serialize(v: Version) = Serialize.serialize(v.major, v.minor)
    def _deserialize(s: String) = {
      for((major, minor) <- deserialize[(Int, Int)](s)) 
      yield Version(major, minor)
    }
  }
}

// xsbt console

// scala> import Version._
// import Version._

// scala> forAll(deserializeSerialize[Version] _) check
// + OK, passed 100 tests.

// There are many reasonable interpretations for the various bits of Serialize code:

// 1. A type class is an interface that a static type may implement; the implicit paramter is the method table.
// 2. A type class is a property of a static type, where we get the Scala compiler to gather evidence that the
// type has this property.

// There are huge number of advantages to type classes over simply implementing a trait:

// 1. The Scala compiler automatically derives serialization/deserialization for lists, tuples, 
// 2. The Version type did not have to know about the serialization or deserialization code.
// 3. The "method table" is determined at compile time.
// 4. I was able to implement deserialize in the same type class, something that cannot be done by implementing an interface.

// As a side note, having the property there makes me feel very good about things. It enables the opposite of defensive programming
// (where you carefully check corner cases) which I like to call "offensive programming", pun intended.

// Take it further:
//
// * An academic paper, perhaps the origination of the idea in Scala: <a href="http://ropas.snu.ac.kr/~bruno/papers/TypeClasses.pdf">Type Classes as Objects and Implicits</a> by Oliviera, Moors, and Odersky (who is the primary creator and author of Scala) 
// * Countless blog posts
// * ScalaCheck uses the Arbitrary type class and many instances for you to build your own tests from.
// * Scalaz includes tons of type classes and instances, and much more.
// * net.liftweb.json.scalaz.JsonScalaz uses JSONR / JSONW / JSON type classes, which I'm going to write about later
// * com.inkling.relaxng authored by yours truly at Inkling uses a Pretty-printing typeclass to test the parser on Arbitrary rnc schemas, somewhat like today's post.

